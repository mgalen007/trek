// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { auth, createTestApp, hasCode, PASSWORD } from './utils';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

// Boots an app with the given per-minute limits (read at startup), and
// restores the suite-wide limits afterwards.
const withLimits = async (
  limits: { default: number; auth: number },
  run: (ctx: Ctx) => Promise<void>,
) => {
  const saved = [
    process.env.RATE_LIMIT_PER_MINUTE,
    process.env.AUTH_RATE_LIMIT_PER_MINUTE,
  ];
  process.env.RATE_LIMIT_PER_MINUTE = String(limits.default);
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = String(limits.auth);
  const ctx = await createTestApp();
  try {
    await run(ctx);
  } finally {
    await ctx.app.close();
    [
      process.env.RATE_LIMIT_PER_MINUTE,
      process.env.AUTH_RATE_LIMIT_PER_MINUTE,
    ] = saved;
  }
};

describe('Production hardening (e2e)', () => {
  describe('health and headers', () => {
    let ctx: Ctx;

    beforeAll(async () => {
      ctx = await createTestApp();
    });

    afterAll(async () => {
      await ctx.app.close();
    });

    it('reports liveness without auth', async () => {
      const res = await ctx.api().get('/api/health').expect(200);

      expect(res.body.data).toMatchObject({ status: 'ok' });
      expect(res.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('reports readiness with the database check', async () => {
      const res = await ctx.api().get('/api/health/ready').expect(200);

      expect(res.body.data).toMatchObject({
        status: 'ok',
        checks: { database: 'up' },
      });
    });

    it('sends security headers and hides the framework', async () => {
      const res = await ctx.api().get('/api/health').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );
      expect(res.headers['content-security-policy']).not.toContain(
        'upgrade-insecure-requests',
      );
    });

    it('still serves the Swagger UI', async () => {
      await ctx
        .api()
        .get('/api/docs')
        .expect(200)
        .expect('Content-Type', /html/);
    });

    it('sends no CORS headers unless origins are configured', async () => {
      const res = await ctx
        .api()
        .get('/api/health')
        .set('Origin', 'https://evil.example')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('rate limiting', () => {
    it('limits login attempts per IP, with Retry-After', () =>
      withLimits({ default: 100, auth: 3 }, async (ctx) => {
        const login = () =>
          ctx
            .api()
            .post('/api/auth/login')
            .send({ email: 'nobody@trek.test', password: 'wrong-password' });

        for (let i = 0; i < 3; i++) await login().expect(401);
        const res = await login()
          .expect(429)
          .expect(hasCode('TOO_MANY_REQUESTS'));

        const retryAfter = Number(res.headers['retry-after']);
        expect(retryAfter).toBeGreaterThan(0);
        expect(res.body.error.details).toEqual({
          retryAfterSeconds: retryAfter,
        });
      }));

    it('gives each signed-in user their own budget', () =>
      withLimits({ default: 5, auth: 100 }, async (ctx) => {
        // Register + login: 2 of this IP's 5 requests.
        const alice = await ctx.signUp('alice@trek.test');

        // One budget across all routes.
        for (let i = 0; i < 3; i++)
          await ctx.api().get('/api/auth/me').set(auth(alice)).expect(200);
        for (let i = 0; i < 2; i++)
          await ctx.api().get('/api/destinations').set(auth(alice)).expect(200);
        await ctx
          .api()
          .get('/api/auth/me')
          .set(auth(alice))
          .expect(429)
          .expect(hasCode('TOO_MANY_REQUESTS'));

        // Alice's requests didn't use up the IP's budget (3rd of 5)...
        await ctx.api().get('/api/auth/me').expect(401);
        // ...and invalid tokens count against the IP, not as new users.
        const forged = () => ctx.api().get('/api/auth/me').set(auth('forged'));
        await forged().expect(401);
        await forged().expect(401);
        await forged().expect(429);
      }));

    it('never limits health checks', () =>
      withLimits({ default: 1, auth: 1 }, async (ctx) => {
        for (let i = 0; i < 5; i++)
          await ctx.api().get('/api/health').expect(200);
      }));

    it('stays within limits for normal use of the strict routes', () =>
      withLimits({ default: 100, auth: 3 }, async (ctx) => {
        await ctx.signUp('bob@trek.test');
        await ctx
          .api()
          .post('/api/auth/login')
          .send({ email: 'bob@trek.test', password: PASSWORD })
          .expect(200);
      }));
  });
});
