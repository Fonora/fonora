/**
 * Google OAuth session auth for Fonoran write access.
 * Zero extra dependencies: uses Node crypto + fetch.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'fonoran_session';
const OAUTH_STATE_COOKIE = 'fonoran_oauth_state';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days
const OAUTH_STATE_MAX_AGE_SEC = 600;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

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

function sessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
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

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieSecure(req) {
  const host = req.headers.host ?? '';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return false;
  return true;
}

function setCookie(res, name, value, { maxAge, req, httpOnly = true }) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  parts.push('Path=/');
  parts.push('SameSite=Lax');
  if (httpOnly) parts.push('HttpOnly');
  if (cookieSecure(req)) parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const next = Array.isArray(existing) ? [...existing, parts.join('; ')] : existing
    ? [String(existing), parts.join('; ')]
    : [parts.join('; ')];
  res.setHeader('Set-Cookie', next);
}

function clearCookie(res, name, req) {
  setCookie(res, name, '', { maxAge: 0, req });
}

function jsonResponse(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function redirect(res, location, req) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
  });
  res.end();
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
    return `/language${rest}`;
  }
  if (path === '/language/') return '/language';
  if (path === '/script/') return '/script';
  return path;
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
export function getSessionUser(req) {
  if (!isAuthEnabled()) return { email: 'dev@local', name: 'Dev' };
  const cookies = parseCookies(req);
  const payload = verifySignedToken(cookies[SESSION_COOKIE]);
  if (!payload?.email || !emailAllowed(payload.email)) return null;
  return { email: payload.email, name: payload.name ?? payload.email };
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
  // Puzzle Conversation playtests are public: anyone who knows the roots can play and
  // their guess-the-meaning results are exactly the evidence the language needs.
  if (m === 'POST' && pathname === '/api/fonoran/puzzle/guess') return false;
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
    const user = getSessionUser(req);
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo') ?? '/language');
    jsonResponse(res, 200, {
      authRequired: isAuthEnabled(),
      authenticated: Boolean(user),
      email: user?.email ?? null,
      name: user?.name ?? null,
      loginUrl: loginUrl(returnTo),
    });
    return true;
  }

  if (pathname === '/auth/logout' && (method === 'POST' || method === 'GET')) {
    clearCookie(res, SESSION_COOKIE, req);
    if (method === 'POST') {
      jsonResponse(res, 200, { ok: true });
    } else {
      redirect(res, sanitizeReturnTo(url.searchParams.get('returnTo') ?? '/language'), req);
    }
    return true;
  }

  if (pathname === '/auth/google' && method === 'GET') {
    if (!isAuthConfigured()) {
      jsonResponse(res, 503, { error: 'Google OAuth is not configured on this server' });
      return true;
    }
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo') ?? '/language');
    const state = randomBytes(24).toString('base64url');

    const stateToken = signPayload({
      state,
      returnTo,
      exp: Math.floor(Date.now() / 1000) + OAUTH_STATE_MAX_AGE_SEC,
    });
    setCookie(res, OAUTH_STATE_COOKIE, stateToken, {
      maxAge: OAUTH_STATE_MAX_AGE_SEC,
      req,
    });

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      access_type: 'online',
    });
    redirect(res, `${GOOGLE_AUTH_URL}?${params}`, req);
    return true;
  }

  if (pathname === '/auth/callback' && method === 'GET') {
    const err = url.searchParams.get('error');
    if (err) {
      redirect(res, `/language?auth_error=${encodeURIComponent(err)}`, req);
      return true;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookies = parseCookies(req);
    const statePayload = verifySignedToken(cookies[OAUTH_STATE_COOKIE]);
    clearCookie(res, OAUTH_STATE_COOKIE, req);

    if (!code || !state || !statePayload?.state || statePayload.state !== state) {
      redirect(res, '/language?auth_error=invalid_state', req);
      return true;
    }

    const returnTo = sanitizeReturnTo(statePayload.returnTo ?? '/language');

    try {
      const tokens = await exchangeCode(code, req);
      const profile = await fetchGoogleUser(tokens.access_token);
      const email = profile.email?.trim().toLowerCase();
      if (!email || profile.email_verified === false) {
        redirect(res, '/language?auth_error=email_unverified', req);
        return true;
      }
      if (!emailAllowed(email)) {
        redirect(res, `/language?auth_error=domain&email=${encodeURIComponent(email)}`, req);
        return true;
      }

      const sessionToken = signPayload({
        email,
        name: profile.name ?? email,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
      });
      setCookie(res, SESSION_COOKIE, sessionToken, {
        maxAge: SESSION_MAX_AGE_SEC,
        req,
      });
      redirect(res, returnTo, req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'auth_failed';
      redirect(res, `/language?auth_error=${encodeURIComponent(msg)}`, req);
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
