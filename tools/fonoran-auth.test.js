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
    __testSealPayload,
    __testOpenPayload,
    __testSafeRedirectTarget,
  } = await import(`./fonoran-auth.js?test=${Date.now()}`);

  const results = [];

  try {
    results.push(
      await test('sealPayload round-trip preserves payload', async () => {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const payload = { email: 'dev@fonora.org', name: 'Dev', exp };
        const token = __testSealPayload(payload);
        assert(typeof token === 'string' && token.length > 20, 'expected sealed token');
        assert(!token.includes('dev@fonora.org'), 'token must not contain cleartext email');
        const opened = __testOpenPayload(token);
        assert(opened?.email === payload.email, 'email mismatch');
        assert(opened?.name === payload.name, 'name mismatch');
        assert(opened?.exp === payload.exp, 'exp mismatch');
      }),
    );

    results.push(
      await test('openPayload rejects expired tokens', async () => {
        const token = __testSealPayload({ email: 'dev@fonora.org', exp: 1 });
        assert(__testOpenPayload(token) === null, 'expected expired token to fail');
      }),
    );

    results.push(
      await test('openPayload rejects legacy HMAC tokens', async () => {
        assert(__testOpenPayload('eyJlbWFpbC5zaGE') === null, 'expected invalid token to fail');
      }),
    );

    results.push(
      await test('safeRedirectTarget blocks open redirects', async () => {
        assert(__testSafeRedirectTarget('/language') === '/language', 'relative path');
        assert(__testSafeRedirectTarget('//evil.example') === '/language', 'protocol-relative');
        assert(__testSafeRedirectTarget('https://evil.example') === '/language', 'absolute external');
        assert(
          __testSafeRedirectTarget('https://accounts.google.com/o/oauth2/v2/auth?x=1')
            === 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
          'google oauth',
        );
        assert(
          __testSafeRedirectTarget('/language?auth_error=denied') === '/language?auth_error=denied',
          'query preserved',
        );
      }),
    );
  } finally {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  }

  return results;
}
