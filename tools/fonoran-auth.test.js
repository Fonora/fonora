/**
 * Fonoran auth session crypto and redirect validation tests.
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      return { name, ok: true };
    } catch (e) {
      return { name, ok: false, error: e.message };
    }
  })();
}

export async function runFonoranAuthTests() {
  const prevSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-session-secret-for-codeql';

  const {
    __testCreateSession,
    __testReadSession,
    __testCreateOAuthState,
    __testConsumeOAuthState,
    __testSanitizeReturnTo,
    __testResolveRole,
  } = await import(`./fonoran-auth.js?test=${Date.now()}`);

  const results = [];

  try {
    results.push(
      await test('opaque session id round-trip preserves payload', async () => {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const payload = { email: 'dev@fonora.org', name: 'Dev', exp };
        const sessionId = __testCreateSession(payload);
        assert(typeof sessionId === 'string' && sessionId.length > 20, 'expected opaque session id');
        assert(!sessionId.includes('dev@fonora.org'), 'session id must not contain cleartext email');
        const opened = __testReadSession(sessionId);
        assert(opened?.email === payload.email, 'email mismatch');
        assert(opened?.name === payload.name, 'name mismatch');
        assert(opened?.exp === payload.exp, 'exp mismatch');
      }),
    );

    results.push(
      await test('readSession rejects expired sessions', async () => {
        const sessionId = __testCreateSession({ email: 'dev@fonora.org', exp: 1 });
        assert(__testReadSession(sessionId) === null, 'expected expired session to fail');
      }),
    );

    results.push(
      await test('readSession rejects unknown ids', async () => {
        assert(__testReadSession('not-a-real-session') === null, 'expected invalid session to fail');
      }),
    );

    results.push(
      await test('oauth state is validated server-side without a cookie', async () => {
        const state = __testCreateOAuthState('/language');
        assert(typeof state === 'string' && state.length > 10, 'expected oauth state id');
        const opened = __testConsumeOAuthState(state);
        assert(opened?.returnTo === '/language', 'returnTo mismatch');
        assert(opened?.provider === 'google', 'provider mismatch');
        assert(__testConsumeOAuthState(state) === null, 'oauth state must be single-use');
      }),
    );

    results.push(
      await test('sanitizeReturnTo blocks open redirects', async () => {
        assert(__testSanitizeReturnTo('/language') === '/language', 'relative path');
        assert(__testSanitizeReturnTo(' /language ') === '/language', 'trimmed relative path');
        assert(__testSanitizeReturnTo('//evil.example') === '/language', 'protocol-relative');
        assert(__testSanitizeReturnTo('/evil') === '/language', 'unknown path');
        assert(__testSanitizeReturnTo('/tools') === '/tools', 'allowed root');
        assert(__testSanitizeReturnTo('/research/notes/foo') === '/research/notes/foo', 'allowed subpath');
      }),
    );
    results.push(
      await test('resolveRole treats ADMIN_EMAILS as admin tier', async () => {
        const prev = process.env.ADMIN_EMAILS;
        process.env.ADMIN_EMAILS = 'info@fonora.org';
        assert(__testResolveRole('info@fonora.org') === 'admin', 'admin email');
        assert(__testResolveRole('user@example.com') === 'community', 'community email');
        if (prev === undefined) delete process.env.ADMIN_EMAILS;
        else process.env.ADMIN_EMAILS = prev;
      }),
    );

    const { isAdminWriteRequired, isAuthEnabled } = await import(`./fonoran-auth.js?test-gate=${Date.now()}`);
    results.push(
      await test('learn progress PUT is not admin-gated', async () => {
        const prevGoogleId = process.env.GOOGLE_CLIENT_ID;
        const prevGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
        const prevSecret = process.env.SESSION_SECRET;
        process.env.GOOGLE_CLIENT_ID = 'test-client';
        process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
        process.env.SESSION_SECRET = 'test-session-secret-for-codeql';
        assert(isAuthEnabled(), 'auth must be enabled to exercise write gates');
        assert(
          isAdminWriteRequired('/api/fonoran/me/progress', 'PUT') === false,
          'community users must sync learn progress',
        );
        assert(
          isAdminWriteRequired('/api/fonoran/lab/regenerate', 'POST') === true,
          'lab writes stay admin-only',
        );
        if (prevGoogleId === undefined) delete process.env.GOOGLE_CLIENT_ID;
        else process.env.GOOGLE_CLIENT_ID = prevGoogleId;
        if (prevGoogleSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
        else process.env.GOOGLE_CLIENT_SECRET = prevGoogleSecret;
        if (prevSecret === undefined) delete process.env.SESSION_SECRET;
        else process.env.SESSION_SECRET = prevSecret;
      }),
    );
  } finally {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  }

  return results;
}
