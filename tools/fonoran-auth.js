/**
 * OAuth session auth: community users (Google or GitHub) + admin tier for vocabulary writes.
 */

import { randomBytes } from 'node:crypto';
import { upsertUser } from './fonoran-community-store.js';

const SESSION_COOKIE = 'fonoran_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;
const OAUTH_STATE_TTL_SEC = 600;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

const AUTH_ERROR_CODES = new Set([
  'invalid_state',
  'email_unverified',
  'domain',
  'denied',
  'auth_failed',
  'not_configured',
]);

/** @type {Map<string, { email: string, name?: string, userId?: string, role: string, provider?: string, exp: number }>} */
const sessions = new Map();

/** @type {Map<string, { returnTo: string, provider: string, exp: number }>} */
const oauthStates = new Map();

function envFlag(name) {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isAuthExplicitlyOff() {
  return envFlag('FONORAN_AUTH_OFF') || process.env.FONORAN_AUTH?.trim().toLowerCase() === 'off';
}

export function isGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim()
    && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function isGitHubConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim()
    && process.env.GITHUB_CLIENT_SECRET?.trim(),
  );
}

export function isAuthConfigured() {
  return Boolean(
    (isGoogleConfigured() || isGitHubConfigured())
    && process.env.SESSION_SECRET?.trim(),
  );
}

export function isAuthEnabled() {
  if (isAuthExplicitlyOff()) return false;
  return isAuthConfigured();
}

function adminEmails() {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return new Set(['info@fonora.org']);
  return new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

function resolveRole(email) {
  const normalized = email?.trim().toLowerCase();
  if (normalized && adminEmails().has(normalized)) return 'admin';
  return 'community';
}

function requestOrigin(req) {
  const host = req.headers.host ?? 'localhost:8000';
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = forwarded
    ? String(forwarded).split(',')[0].trim()
    : (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function googleRedirectUri(req) {
  const override = process.env.AUTH_CALLBACK_URL?.trim();
  if (override) return override;
  return `${requestOrigin(req)}/auth/callback`;
}

function githubRedirectUri(req) {
  const override = process.env.GITHUB_CALLBACK_URL?.trim();
  if (override) return override;
  return `${requestOrigin(req)}/auth/github/callback`;
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

function createOAuthState(returnTo, provider) {
  purgeExpired(oauthStates);
  const id = newOpaqueId(24);
  oauthStates.set(id, {
    returnTo: sanitizeReturnTo(returnTo),
    provider,
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

function loginUrls(returnTo) {
  const q = new URLSearchParams({ returnTo: sanitizeReturnTo(returnTo) });
  return {
    google: isGoogleConfigured() ? `/auth/google?${q}` : null,
    github: isGitHubConfigured() ? `/auth/github?${q}` : null,
    primary: isGoogleConfigured()
      ? `/auth/google?${q}`
      : isGitHubConfigured()
        ? `/auth/github?${q}`
        : '/auth/google',
  };
}

async function finishOAuthLogin(req, res, returnTo, profile) {
  const email = profile.email?.trim().toLowerCase();
  if (!email || profile.emailVerified === false) {
    redirectToAuthError(res, 'email_unverified');
    return;
  }

  const user = await upsertUser({
    provider: profile.provider,
    providerSub: profile.providerSub,
    email,
    name: profile.name ?? email,
  });
  const role = resolveRole(email);

  const sessionId = createSession({
    email,
    name: profile.name ?? email,
    userId: user.id,
    role,
    provider: profile.provider,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
  });
  setSessionCookie(res, sessionId, SESSION_MAX_AGE_SEC, req);
  redirectToLocalPath(res, returnTo);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {{ email: string, name?: string, userId?: string, role: string, provider?: string } | null}
 */
export function getAuthenticatedUser(req) {
  if (!isAuthConfigured()) return null;
  const cookies = parseCookies(req);
  const payload = readSession(cookies[SESSION_COOKIE]);
  if (!payload?.email) return null;
  return {
    email: payload.email,
    name: payload.name ?? payload.email,
    userId: payload.userId ?? null,
    role: payload.role ?? 'community',
    provider: payload.provider ?? null,
  };
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
export function getSessionUser(req) {
  if (!isAuthEnabled()) {
    return {
      email: 'dev@local',
      name: 'Dev',
      userId: 'dev-local',
      role: 'admin',
      provider: 'dev',
    };
  }
  return getAuthenticatedUser(req);
}

export function isCommunityUser(req) {
  return Boolean(getSessionUser(req));
}

export function isAdminUser(req) {
  if (!isAuthEnabled()) return true;
  const user = getSessionUser(req);
  return user?.role === 'admin';
}

/** Lab/editorial writes require admin, not merely authenticated community users. */
export function isAdminWriteRequired(pathname, method) {
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
  if (m === 'POST' && pathname === '/api/fonoran/analyze/word') return false;
  if (pathname.startsWith('/api/fonoran/me/')) return false;
  if (pathname.startsWith('/api/fonoran/proposals')) {
    if (pathname.match(/^\/api\/fonoran\/proposals\/[^/]+\/resolve$/) && m === 'POST') return true;
    return false;
  }
  if (pathname.match(/^\/api\/fonoran\/words\/[^/]+\/vote$/) && m === 'POST') return false;
  return m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE';
}

/** @deprecated use isAdminWriteRequired */
export function isWriteAuthRequired(pathname, method) {
  return isAdminWriteRequired(pathname, method);
}

export function isCommunityWriteRequired(pathname, method) {
  const m = method.toUpperCase();
  if (m !== 'POST' && m !== 'PUT' && m !== 'PATCH' && m !== 'DELETE') return false;
  if (pathname === '/api/fonoran/me/progress' && m === 'PUT') return true;
  if (pathname === '/api/fonoran/proposals' && m === 'POST') return true;
  if (pathname.match(/^\/api\/fonoran\/proposals\/[^/]+\/vote$/) && m === 'POST') return true;
  if (pathname.match(/^\/api\/fonoran\/words\/[^/]+\/vote$/) && m === 'POST') return true;
  return false;
}

export function isSnapshotAdminRequired(pathname, method) {
  const m = method.toUpperCase();
  if (pathname === '/api/fonoran/snapshot/status' && m === 'GET') return false;
  if (pathname === '/api/fonoran/snapshot/preview' && m === 'POST') return false;
  return pathname.startsWith('/api/fonoran/snapshot/');
}

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
    hint: 'Only the Fonora vocabulary admin can edit canon. Sign in with the admin account.',
  });
}

export function unauthorizedResponse(res) {
  jsonResponse(res, 401, {
    error: 'Authentication required',
    loginUrl: '/auth/google',
    loginUrls: loginUrls('/language'),
  });
}

export function communityRequiredResponse(res) {
  jsonResponse(res, 401, {
    error: 'Sign in required',
    hint: 'Use Google or GitHub to vote, propose words, or sync learn progress.',
    loginUrls: loginUrls('/language'),
  });
}

async function exchangeGoogleCode(code, req) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    redirect_uri: googleRedirectUri(req),
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
  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = await profileRes.json().catch(() => ({}));
  if (!profileRes.ok) {
    throw new Error(profile.error?.message || 'Could not load Google profile');
  }
  return {
    provider: 'google',
    providerSub: String(profile.sub),
    email: profile.email,
    emailVerified: profile.email_verified !== false,
    name: profile.name ?? profile.email,
  };
}

async function exchangeGitHubCode(code, req) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GITHUB_CLIENT_ID?.trim() ?? '',
    client_secret: process.env.GITHUB_CLIENT_SECRET?.trim() ?? '',
    redirect_uri: githubRedirectUri(req),
  });
  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || 'GitHub token exchange failed');
  }
  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Fonora-Community-Auth',
  };
  const userRes = await fetch(GITHUB_USER_URL, { headers });
  const user = await userRes.json().catch(() => ({}));
  if (!userRes.ok) throw new Error('Could not load GitHub profile');

  let email = user.email?.trim().toLowerCase();
  let emailVerified = Boolean(email);
  if (!email) {
    const emailsRes = await fetch(GITHUB_EMAILS_URL, { headers });
    const emails = await emailsRes.json().catch(() => []);
    const primary = emails.find(e => e.primary && e.verified)
      ?? emails.find(e => e.verified);
    email = primary?.email?.trim().toLowerCase();
    emailVerified = Boolean(primary?.verified);
  }

  return {
    provider: 'github',
    providerSub: String(user.id),
    email,
    emailVerified,
    name: user.name ?? user.login ?? email,
  };
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
    const urls = loginUrls(returnTo);
    jsonResponse(res, 200, {
      authRequired: isAuthEnabled(),
      authConfigured: isAuthConfigured(),
      toolsGated: isAuthConfigured(),
      authenticated: Boolean(user),
      email: user?.email ?? null,
      name: user?.name ?? null,
      userId: user?.userId ?? null,
      role: user?.role ?? null,
      isAdmin: user?.role === 'admin',
      provider: user?.provider ?? null,
      loginUrl: urls.primary,
      loginUrls: urls,
      googleLoginUrl: urls.google,
      githubLoginUrl: urls.github,
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
    if (!isGoogleConfigured()) {
      jsonResponse(res, 503, { error: 'Google OAuth is not configured on this server' });
      return true;
    }
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo') ?? '/language');
    const state = createOAuthState(returnTo, 'google');
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
      redirect_uri: googleRedirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      access_type: 'online',
    });
    redirect302(res, `${GOOGLE_AUTH_URL}?${params}`);
    return true;
  }

  if (pathname === '/auth/github' && method === 'GET') {
    if (!isGitHubConfigured()) {
      jsonResponse(res, 503, { error: 'GitHub OAuth is not configured on this server' });
      return true;
    }
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo') ?? '/language');
    const state = createOAuthState(returnTo, 'github');
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID?.trim() ?? '',
      redirect_uri: githubRedirectUri(req),
      scope: 'read:user user:email',
      state,
    });
    redirect302(res, `${GITHUB_AUTH_URL}?${params}`);
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
    if (!code || !state || !statePayload || statePayload.provider !== 'google') {
      redirectToAuthError(res, 'invalid_state');
      return true;
    }
    try {
      const profile = await exchangeGoogleCode(code, req);
      await finishOAuthLogin(req, res, statePayload.returnTo ?? '/language', profile);
    } catch (e) {
      console.error('Google OAuth callback failed:', e);
      redirectToAuthError(res, 'auth_failed');
    }
    return true;
  }

  if (pathname === '/auth/github/callback' && method === 'GET') {
    const err = url.searchParams.get('error');
    if (err) {
      redirectToAuthError(res, normalizeAuthErrorCode(err));
      return true;
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const statePayload = consumeOAuthState(state);
    if (!code || !state || !statePayload || statePayload.provider !== 'github') {
      redirectToAuthError(res, 'invalid_state');
      return true;
    }
    try {
      const profile = await exchangeGitHubCode(code, req);
      await finishOAuthLogin(req, res, statePayload.returnTo ?? '/language', profile);
    } catch (e) {
      console.error('GitHub OAuth callback failed:', e);
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
    const admins = adminEmails();
    const providers = [
      isGoogleConfigured() ? 'Google' : null,
      isGitHubConfigured() ? 'GitHub' : null,
    ].filter(Boolean).join(' + ');
    console.log(
      `Fonoran auth: enabled (${providers}); admin: ${[...admins].join(', ')}`,
    );
    return;
  }
  console.warn(
    'Fonoran auth: not configured — write API is open in dev. Set OAuth credentials and SESSION_SECRET to enable.',
  );
}

export function __testCreateSession(payload) {
  return createSession(payload);
}

export function __testReadSession(id) {
  return readSession(id);
}

export function __testCreateOAuthState(returnTo, provider = 'google') {
  return createOAuthState(returnTo, provider);
}

export function __testConsumeOAuthState(id) {
  return consumeOAuthState(id);
}

export function __testSanitizeReturnTo(raw) {
  return sanitizeReturnTo(raw);
}

export function __testResolveRole(email) {
  return resolveRole(email);
}
