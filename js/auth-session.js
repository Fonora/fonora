import { setFonoranAuth } from './universal-nav.js';
import { appendRefToAuthUrl } from './learn-ref.js';

/** @type {{ required: boolean, configured: boolean, toolsGated: boolean, authenticated: boolean, isAdmin: boolean, email: string | null, userId: string | null, referralCount: number, loginUrl: string, loginUrls: { google?: string | null, primary: string } }} */
let authState = {
  required: false,
  configured: false,
  toolsGated: false,
  authenticated: false,
  isAdmin: false,
  email: null,
  userId: null,
  referralCount: 0,
  loginUrl: '/auth/google',
  loginUrls: { primary: '/auth/google', google: '/auth/google' },
};

export function getAuthState() {
  return authState;
}

export function canAccessTools() {
  return !authState.toolsGated || authState.isAdmin;
}

export function canAccessWordManager() {
  if (!authState.toolsGated) return true;
  return authState.isAdmin;
}

export function authReturnPath() {
  const path = window.location.pathname || '/';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  return `${path}${search}${hash}` || '/';
}

function applyAuthState(data) {
  const loginUrl = appendRefToAuthUrl(data.loginUrl ?? '/auth/google');
  const rawLoginUrls = data.loginUrls ?? { primary: data.loginUrl ?? '/auth/google' };
  const loginUrls = {
    ...rawLoginUrls,
    primary: appendRefToAuthUrl(rawLoginUrls.primary ?? loginUrl),
    google: rawLoginUrls.google ? appendRefToAuthUrl(rawLoginUrls.google) : rawLoginUrls.google,
  };
  authState = {
    required: Boolean(data.authRequired),
    configured: Boolean(data.authConfigured),
    toolsGated: Boolean(data.toolsGated ?? data.learnToolsGated),
    authenticated: Boolean(data.authenticated),
    isAdmin: Boolean(data.isAdmin),
    email: data.email ?? null,
    userId: data.userId ?? null,
    referralCount: Number(data.referralCount ?? 0),
    loginUrl,
    loginUrls,
  };
  setFonoranAuth(authState);
  syncToolsAuthGateLink();
  if (authState.authenticated && authState.userId) {
    void syncLearnProgressFromServer();
  }
  if (document.getElementById('learn-progress-stats')) {
    void import('./learn-home-progress.js').then(({ refreshLearnHomeProgress }) => refreshLearnHomeProgress());
  }
}

function syncToolsAuthGateLink() {
  const link = document.getElementById('tools-auth-gate-sign-in');
  if (link) link.href = authState.loginUrl;
}

export async function refreshAuth() {
  try {
    const returnTo = authReturnPath();
    const res = await fetch(`/auth/session?returnTo=${encodeURIComponent(returnTo)}`, { credentials: 'include' });
    const data = await res.json();
    applyAuthState(data);
  } catch {
    applyAuthState({
      authRequired: false,
      authConfigured: false,
      toolsGated: false,
      authenticated: true,
      isAdmin: true,
      email: null,
      userId: null,
      referralCount: 0,
      loginUrl: '/auth/google',
      loginUrls: { primary: '/auth/google' },
    });
  }
}

async function syncLearnProgressFromServer() {
  try {
    const { mergeLearnProgressOnLogin } = await import('./learn-gamification.js');
    await mergeLearnProgressOnLogin();
  } catch {
    /* learn bundle may not be loaded on all pages */
  }
}

export async function signOut() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  await refreshAuth();
}

export function handleAuthUrlErrors() {
  const params = new URLSearchParams(window.location.search);
  const err = params.get('auth_error');
  if (!err) return;
  params.delete('auth_error');
  params.delete('email');
  const next = params.toString();
  const clean = `${window.location.pathname}${window.location.hash}${next ? `?${next}` : ''}`;
  history.replaceState(null, '', clean);
}
