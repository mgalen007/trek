// supertest types response bodies as `any`; asserting on them is the point here.

import { auth, createTestApp, hasCode, PASSWORD } from './utils';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
type Tokens = { accessToken: string; refreshToken: string };

const tokens = (res: { body: unknown }) => (res.body as { data: Tokens }).data;

// The trek_refresh Set-Cookie line of a response, if any.
const refreshCookie = (res: { headers: Record<string, unknown> }) =>
  ((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) =>
    c.startsWith('trek_refresh='),
  );
const cookieValue = (setCookie: string | undefined) =>
  setCookie?.split(';')[0].split('=').slice(1).join('=');
const isCleared = (setCookie: string | undefined) =>
  !!setCookie && /Expires=Thu, 01 Jan 1970/.test(setCookie);

// Boots an app with extra settings (read at startup), then restores them.
const withEnv = async (
  vars: Record<string, string>,
  run: (ctx: Ctx) => Promise<void>,
) => {
  const saved = Object.fromEntries(
    Object.keys(vars).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, vars);
  const ctx = await createTestApp();
  try {
    await run(ctx);
  } finally {
    await ctx.app.close();
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
};

describe('Browser sessions: refresh token cookie (e2e)', () => {
  let ctx: Ctx;
  const api = () => ctx.api();
  const login = (email = 'ada@trek.test') =>
    api()
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
  const withCookie = (token: string) => ({ Cookie: `trek_refresh=${token}` });

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.signUp('ada@trek.test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('login sets the refresh token as an httpOnly cookie, and in the body', async () => {
    const res = await login();
    const cookie = refreshCookie(res);

    expect(cookieValue(cookie)).toBe(tokens(res).refreshToken);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toMatch(/Expires=/);
    // Plain HTTP in development and tests.
    expect(cookie).not.toContain('Secure');
  });

  it('refreshes from the cookie alone, and renews the cookie', async () => {
    const first = cookieValue(refreshCookie(await login()))!;

    const res = await api()
      .post('/api/auth/refresh')
      .set(withCookie(first))
      .expect(200);

    const renewed = cookieValue(refreshCookie(res));
    expect(renewed).toBe(tokens(res).refreshToken);
    expect(renewed).not.toBe(first);
    await api()
      .get('/api/auth/me')
      .set(auth(tokens(res).accessToken))
      .expect(200);
  });

  it('prefers a token in the body over the cookie', async () => {
    const { refreshToken } = tokens(await login());

    await api()
      .post('/api/auth/refresh')
      .set(withCookie('stale-or-garbage'))
      .send({ refreshToken })
      .expect(200);
  });

  it('without any token, answers 401 and clears the cookie', async () => {
    const res = await api()
      .post('/api/auth/refresh')
      .expect(401)
      .expect(hasCode('INVALID_REFRESH_TOKEN'));

    expect(isCleared(refreshCookie(res))).toBe(true);
  });

  it('clears the cookie when its token is no longer valid', async () => {
    const res = await api()
      .post('/api/auth/refresh')
      .set(withCookie('not-a-real-token'))
      .expect(401)
      .expect(hasCode('INVALID_REFRESH_TOKEN'));

    expect(isCleared(refreshCookie(res))).toBe(true);
  });

  it('logout revokes the session from the cookie and clears it', async () => {
    const token = cookieValue(refreshCookie(await login()))!;

    const res = await api()
      .post('/api/auth/logout')
      .set(withCookie(token))
      .expect(204);

    expect(isCleared(refreshCookie(res))).toBe(true);
    await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: token })
      .expect(401)
      .expect(hasCode('INVALID_REFRESH_TOKEN'));
  });

  it('logout without any token still succeeds', async () => {
    await api().post('/api/auth/logout').expect(204);
  });

  it('logout-all clears the cookie too', async () => {
    const { accessToken } = tokens(await login());

    const res = await api()
      .post('/api/auth/logout-all')
      .set(auth(accessToken))
      .expect(204);

    expect(isCleared(refreshCookie(res))).toBe(true);
  });

  it('change-password sets the new session as the cookie', async () => {
    await ctx.signUp('bob@trek.test');
    const { accessToken } = tokens(await login('bob@trek.test'));

    const res = await api()
      .post('/api/auth/change-password')
      .set(auth(accessToken))
      .send({ currentPassword: PASSWORD, newPassword: 'another-password-1' })
      .expect(200);

    expect(cookieValue(refreshCookie(res))).toBe(tokens(res).refreshToken);
  });
});

describe('Browser sessions: settings and CORS (e2e)', () => {
  it('can be HTTPS-only and SameSite=Strict', () =>
    withEnv(
      { REFRESH_COOKIE_SECURE: 'true', REFRESH_COOKIE_SAMESITE: 'strict' },
      async (ctx) => {
        await ctx.signUp('secure@trek.test');
        const res = await ctx
          .api()
          .post('/api/auth/login')
          .send({ email: 'secure@trek.test', password: PASSWORD })
          .expect(200);

        const cookie = refreshCookie(res);
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Strict');
      },
    ));

  it('lets allowed origins send credentials, and only them', () =>
    withEnv({ CORS_ORIGINS: 'http://localhost:5173' }, async (ctx) => {
      const allowed = await ctx
        .api()
        .options('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      expect(allowed.headers['access-control-allow-origin']).toBe(
        'http://localhost:5173',
      );
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');

      const other = await ctx
        .api()
        .options('/api/auth/refresh')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    }));
});
