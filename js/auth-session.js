import { setFonoranAuth } from './universal-nav.js';

/** @type {{ required: boolean, configured: boolean, toolsGated: boolean, authenticated: boolean, email: string | null, loginUrl: string }} */
let authState = {
  required: false,
  configured: false,
  toolsGated: false,
  authenticated: false,
  email: null,
  loginUrl: '/auth/google',
};

export function getAuthState() {
  return authState;
}

export function canAccessTools() {
  return !authState.toolsGated || authState.authenticated;
}

export function authReturnPath() {
  const path = window.location.pathname || '/';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  return `${path}${search}${hash}` || '/';
}

function applyAuthState(data) {
  authState = {
    required: Boolean(data.authRequired),
    configured: Boolean(data.authConfigured),
    toolsGated: Boolean(data.toolsGated ?? data.learnToolsGated),
    authenticated: Boolean(data.authenticated),
    email: data.email ?? null,
    loginUrl: data.loginUrl ?? '/auth/google',
  };
  setFonoranAuth(authState);
  syncToolsAuthGateLink();
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
      email: null,
      loginUrl: '/auth/google',
    });
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
