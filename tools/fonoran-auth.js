/**
 * Google OAuth session auth for Fonoran write access.
 * Zero extra dependencies: uses Node crypto + fetch.
 */

import { randomBytes } from 'node:crypto';

const SESSION_COOKIE = 'fonoran_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days
const OAUTH_STATE_TTL_SEC = 600;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const AUTH_ERROR_CODES = new Set([
  'invalid_state',
  'email_unverified',
  'domain',
  'denied',
  'auth_failed',
]);

/** @type {Map<string, { email: string, name?: string, exp: number }>} */
const sessions = new Map();

/** @type {Map<string, { returnTo: string, exp: number }>} */
const oauthStates = new Map();

function envFlag(name) {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isAuthExplicitlyOff() {
  return envFlag('FONORAN_AUTH_OFF') || process.env.FONORAN_AUTH?.trim().toLowerCase() === 'off';
}

export function isAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim()
    && process.env.GOOGLE_CLIENT_SECRET?.trim()
    && process.env.SESSION_SECRET?.trim(),
  );
}

/** When true, mutating Fonoran API routes require a valid session. */
export function isAuthEnabled() {
  if (isAuthExplicitlyOff()) return false;
  return isAuthConfigured();
}

function allowedDomain() {
  return (process.env.ALLOWED_DOMAIN ?? 'fonora.org').trim().toLowerCase();
}

function allowedEmails() {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return null;
  return new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

function requestOrigin(req) {
  const host = req.headers.host ?? 'localhost:8000';
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = forwarded
    ? String(forwarded).split(',')[0].trim()
    : (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function redirectUri(req) {
  const override = process.env.AUTH_CALLBACK_URL?.trim();
  if (override) return override;
  return `${requestOrigin(req)}/auth/callback`;
}

function parseCookies(req) {
  /** @type {Record<string, string>} */
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function purgeExpired(store) {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, record] of store) {
    if (!record?.exp || record.exp < now) store.delete(key);
  }
}

function newOpaqueId(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function createSession(record) {
  purgeExpired(sessions);
  const id = newOpaqueId();
  sessions.set(id, record);
  return id;
}

function readSession(id) {
  if (!id) return null;
  const record = sessions.get(id);
  if (!record?.exp || record.exp < Math.floor(Date.now() / 1000)) {
    sessions.delete(id);
    return null;
  }
  return record;
}

function destroySession(id) {
  if (id) sessions.delete(id);
}

function createOAuthState(returnTo) {
  purgeExpired(oauthStates);
  const id = newOpaqueId(24);
  oauthStates.set(id, {
    returnTo: sanitizeReturnTo(returnTo),
    exp: Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SEC,
  });
  return id;
}

function consumeOAuthState(id) {
  if (!id) return null;
  const record = oauthStates.get(id);
  oauthStates.delete(id);
  if (!record?.exp || record.exp < Math.floor(Date.now() / 1000)) return null;
  return record;
}

function cookieSecure(req) {
  const host = req.headers.host ?? '';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return false;
  return true;
}

/** Set HttpOnly session cookie (opaque id only — no PII in the cookie value). */
function setSessionCookie(res, sessionId, maxAge, req) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  parts.push('Path=/');
  parts.push('SameSite=Lax');
  parts.push('HttpOnly');
  if (cookieSecure(req)) parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const next = Array.isArray(existing) ? [...existing, parts.join('; ')] : existing
    ? [String(existing), parts.join('; ')]
    : [parts.join('; ')];
  res.setHeader('Set-Cookie', next);
}

function clearSessionCookie(res, req) {
  const parts = [`${SESSION_COOKIE}=`, 'Max-Age=0', 'Path=/', 'SameSite=Lax', 'HttpOnly'];
  if (cookieSecure(req)) parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const next = Array.isArray(existing) ? [...existing, parts.join('; ')] : existing
    ? [String(existing), parts.join('; ')]
    : [parts.join('; ')];
  res.setHeader('Set-Cookie', next);
}

function jsonResponse(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function redirect302(res, locationHeader) {
  res.writeHead(302, {
    Location: locationHeader,
    'Cache-Control': 'no-store',
  });
  res.end();
}

function redirectToLocalPath(res, sanitizedPath) {
  redirect302(res, sanitizeReturnTo(sanitizedPath));
}

function redirectToAuthError(res, code, details = {}) {
  const safeCode = AUTH_ERROR_CODES.has(code) ? code : 'auth_failed';
  let target = `/language?auth_error=${encodeURIComponent(safeCode)}`;
  if (safeCode === 'domain' && details.email) {
    target += `&email=${encodeURIComponent(String(details.email).slice(0, 200))}`;
  }
  redirect302(res, target);
}

function redirectToGoogleOAuth(res, params) {
  const googleUrl = new URL(GOOGLE_AUTH_URL);
  for (const [key, value] of params.entries()) {
    googleUrl.searchParams.set(key, value);
  }
  redirect302(res, googleUrl.toString());
}

function sanitizeReturnTo(raw) {
  if (!raw || typeof raw !== 'string') return '/language';
  let path = raw.trim();
  if (!path.startsWith('/')) return '/language';
  if (path.startsWith('//')) return '/language';
  if (path.includes('\\')) return '/language';

  if (path === '/fonoran' || path.startsWith('/fonoran/')) {
    let rest = path.slice('/fonoran'.length);
    if (!rest || rest === '/') rest = '';
    path = `/language${rest}`;
  }

  if (path === '/language/') path = '/language';
  if (path === '/script/') path = '/script';

  if (path === '/') return '/';
  const allowedRoots = ['/language', '/script', '/learn', '/tools', '/research'];
  for (const root of allowedRoots) {
    if (path === root || path.startsWith(`${root}/`)) return path;
  }

  return '/language';
}

function normalizeAuthErrorCode(raw) {
  const code = String(raw || '').trim().toLowerCase().slice(0, 64);
  if (AUTH_ERROR_CODES.has(code)) return code;
  if (code === 'access_denied') return 'denied';
  return 'auth_failed';
}

function emailAllowed(email) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return false;
  const allowlist = allowedEmails();
  if (allowlist) return allowlist.has(normalized);
  const domain = allowedDomain();
  return normalized.endsWith(`@${domain}`);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {{ email: string, name?: string } | null}
 */
export function getAuthenticatedUser(req) {
  if (!isAuthConfigured()) return null;
  const cookies = parseCookies(req);
  const payload = readSession(cookies[SESSION_COOKIE]);
  if (!payload?.email || !emailAllowed(payload.email)) return null;
  return { email: payload.email, name: payload.name ?? payload.email };
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {{ email: string, name?: string } | null}
 */
export function getSessionUser(req) {
  if (!isAuthEnabled()) return { email: 'dev@local', name: 'Dev' };
  return getAuthenticatedUser(req);
}

/** Preview graph POST does not mutate lab data. */
export function isWriteAuthRequired(pathname, method) {
  if (!isAuthEnabled()) return false;
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  if (m === 'POST' && pathname === '/api/fonoran/lab/graph/preview') return false;
  if (m === 'POST' && pathname === '/api/fonoran/translate') return false;
  if (m === 'POST' && pathname === '/api/fonoran/translation-tests/run') return false;
  if (m === 'POST' && pathname === '/api/fonoran/snapshot/preview') return false;
  if (m === 'POST' && pathname === '/api/fonoran/puzzle/guess') return false;
  if (m === 'POST' && pathname === '/api/fonoran/puzzle/feedback') return false;
  if (m === 'POST' && pathname === '/api/fonoran/expressions/candidates') return false;
  return m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE';
}

/** Snapshot export/import requires admin when ADMIN_EMAILS is set. */
export function isAdminUser(req) {
  if (!isAuthEnabled()) return true;
  const user = getSessionUser(req);
  if (!user) return false;
  const allowlist = allowedEmails();
  if (allowlist) return allowlist.has(user.email.toLowerCase());
  return true;
}

export function isSnapshotAdminRequired(pathname, method) {
  const m = method.toUpperCase();
  if (pathname === '/api/fonoran/snapshot/status' && m === 'GET') return false;
  if (pathname === '/api/fonoran/snapshot/preview' && m === 'POST') return false;
  return pathname.startsWith('/api/fonoran/snapshot/');
}

/** Regeneration pipeline mutates editorial + lab state — admin on prod. */
export function isRegenAdminRequired(pathname, method) {
  const m = method.toUpperCase();
  if (pathname === '/api/fonoran/lab/regen/status' && m === 'GET') return false;
  if (m !== 'POST') return false;
  return pathname === '/api/fonoran/lab/regenerate'
    || pathname === '/api/fonoran/lab/editorial/import'
    || pathname === '/api/fonoran/lab/optimize-compounds';
}

export function adminRequiredResponse(res) {
  jsonResponse(res, 403, {
    error: 'Admin access required',
    hint: 'Set ADMIN_EMAILS on the server or sign in with an listed account.',
  });
}

export function unauthorizedResponse(res) {
  jsonResponse(res, 401, {
    error: 'Authentication required',
    loginUrl: '/auth/google',
  });
}

function loginUrl(returnTo) {
  const q = new URLSearchParams({ returnTo: sanitizeReturnTo(returnTo) });
  return `/auth/google?${q}`;
}

async function exchangeCode(code, req) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const body = new URLSearchParams({
    code,
    client_id: clientId ?? '',
    client_secret: clientSecret ?? '',
    redirect_uri: redirectUri(req),
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  return data;
}

async function fetchGoogleUser(accessToken) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || 'Could not load Google profile');
  }
  return data;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {string} method
 * @returns {Promise<boolean>}
 */
export async function handleAuthRoutes(req, res, url, method) {
  const pathname = url.pathname;

  if (pathname === '/auth/session' && method === 'GET') {
    const user = getAuthenticatedUser(req);
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo') ?? '/language');
    const configured = isAuthConfigured();
    jsonResponse(res, 200, {
      authRequired: isAuthEnabled(),
      authConfigured: configured,
      toolsGated: configured,
      authenticated: Boolean(user),
      email: user?.email ?? null,
      name: user?.name ?? null,
      loginUrl: loginUrl(returnTo),
    });
    return true;
  }

  if (pathname === '/auth/logout' && (method === 'POST' || method === 'GET')) {
    const cookies = parseCookies(req);
    destroySession(cookies[SESSION_COOKIE]);
    clearSessionCookie(res, req);
    if (method === 'POST') {
      jsonResponse(res, 200, { ok: true });
    } else {
      redirectToLocalPath(res, sanitizeReturnTo(url.searchParams.get('returnTo') ?? '/language'));
    }
    return true;
  }

  if (pathname === '/auth/google' && method === 'GET') {
    if (!isAuthConfigured()) {
      jsonResponse(res, 503, { error: 'Google OAuth is not configured on this server' });
      return true;
    }
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo') ?? '/language');
    const state = createOAuthState(returnTo);

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      access_type: 'online',
    });
    redirectToGoogleOAuth(res, params);
    return true;
  }

  if (pathname === '/auth/callback' && method === 'GET') {
    const err = url.searchParams.get('error');
    if (err) {
      redirectToAuthError(res, normalizeAuthErrorCode(err));
      return true;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const statePayload = consumeOAuthState(state);

    if (!code || !state || !statePayload) {
      redirectToAuthError(res, 'invalid_state');
      return true;
    }

    const returnTo = statePayload.returnTo ?? '/language';

    try {
      const tokens = await exchangeCode(code, req);
      const profile = await fetchGoogleUser(tokens.access_token);
      const email = profile.email?.trim().toLowerCase();
      if (!email || profile.email_verified === false) {
        redirectToAuthError(res, 'email_unverified');
        return true;
      }
      if (!emailAllowed(email)) {
        redirectToAuthError(res, 'domain', { email });
        return true;
      }

      const sessionId = createSession({
        email,
        name: profile.name ?? email,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
      });
      setSessionCookie(res, sessionId, SESSION_MAX_AGE_SEC, req);
      redirectToLocalPath(res, returnTo);
    } catch (e) {
      console.error('OAuth callback failed:', e);
      redirectToAuthError(res, 'auth_failed');
    }
    return true;
  }

  return false;
}

export function logAuthStatus() {
  if (isAuthExplicitlyOff()) {
    console.log('Fonoran auth: disabled (FONORAN_AUTH=off)');
    return;
  }
  if (isAuthConfigured()) {
    const domain = allowedDomain();
    const allowlist = allowedEmails();
    console.log(
      `Fonoran auth: enabled: ${allowlist ? `allowlist (${allowlist.size} emails)` : `@${domain} only`}`,
    );
    return;
  }
  console.warn(
    'Fonoran auth: not configured: write API is open. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET to enable.',
  );
}

/** @internal Test helpers */
export function __testCreateSession(payload) {
  return createSession(payload);
}

export function __testReadSession(id) {
  return readSession(id);
}

export function __testCreateOAuthState(returnTo) {
  return createOAuthState(returnTo);
}

export function __testConsumeOAuthState(id) {
  return consumeOAuthState(id);
}

export function __testSanitizeReturnTo(raw) {
  return sanitizeReturnTo(raw);
}
