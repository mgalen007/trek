// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { auth, createTestApp, hasCode, PASSWORD } from './utils';

type Tokens = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

describe('Auth sessions (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const api = () => ctx.api();

  const login = async (email = 'user@trek.test') =>
    (
      await api()
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200)
    ).body.data as Tokens;
  const refresh = (refreshToken: string) =>
    api().post('/api/auth/refresh').send({ refreshToken });
  const refreshed = async (refreshToken: string) =>
    (await refresh(refreshToken).expect(200)).body.data as Tokens;
  const me = (accessToken: string) =>
    api().get('/api/auth/me').set(auth(accessToken));
  // Moves a spent token's use back in time, past the retry window.
  const ageUse = (seconds: number) =>
    ctx.prisma.refreshToken.updateMany({
      where: { usedAt: { not: null } },
      data: { usedAt: new Date(Date.now() - seconds * 1000) },
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.signUp('user@trek.test');
    await ctx.signUp('other@trek.test');
  });

  beforeEach(async () => {
    await ctx.prisma.refreshToken.deleteMany();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('logs in with an access token and a refresh token', async () => {
    const tokens = await login();

    expect(tokens).toMatchObject({ tokenType: 'Bearer' });
    expect(tokens.expiresIn).toBeGreaterThan(0);
    expect(new Date(tokens.refreshTokenExpiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    await me(tokens.accessToken).expect(200);
  });

  it('only stores a hash of the refresh token', async () => {
    const { refreshToken } = await login();

    const rows = await ctx.prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toContain(refreshToken);
  });

  it('rotates the refresh token on every refresh', async () => {
    const first = await login();
    const second = await refreshed(first.refreshToken);
    const third = await refreshed(second.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(third.refreshToken).not.toBe(second.refreshToken);
    await me(third.accessToken).expect(200);
  });

  it('answers a quick retry of the same refresh token', async () => {
    const { refreshToken } = await login();
    const a = await refreshed(refreshToken);
    const b = await refreshed(refreshToken);

    expect(b.refreshToken).not.toBe(a.refreshToken);
    await refreshed(a.refreshToken);
    await refreshed(b.refreshToken);
  });

  it('revokes the whole session when a spent token is replayed later', async () => {
    const { refreshToken: stolen } = await login();
    const latest = await refreshed(stolen);
    await ageUse(60);

    await refresh(stolen).expect(401).expect(hasCode('REFRESH_TOKEN_REUSED'));
    await refresh(latest.refreshToken)
      .expect(401)
      .expect(hasCode('INVALID_REFRESH_TOKEN'));
  });

  it("leaves the user's other sessions alone on reuse", async () => {
    const other = await login();
    const { refreshToken: stolen } = await login();
    await refreshed(stolen);
    await ageUse(60);

    await refresh(stolen).expect(401);
    await refreshed(other.refreshToken);
  });

  it('rejects unknown and expired refresh tokens', async () => {
    await refresh('not-a-real-token')
      .expect(401)
      .expect(hasCode('INVALID_REFRESH_TOKEN'));

    const { refreshToken } = await login();
    await ctx.prisma.refreshToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await refresh(refreshToken)
      .expect(401)
      .expect(hasCode('INVALID_REFRESH_TOKEN'));
  });

  it('validates the refresh body', async () => {
    await api()
      .post('/api/auth/refresh')
      .send({})
      .expect(400)
      .expect(hasCode('VALIDATION_FAILED'));
  });

  it('logout ends only that session', async () => {
    const phone = await login();
    const laptop = await login();

    await api()
      .post('/api/auth/logout')
      .send({ refreshToken: phone.refreshToken })
      .expect(204);

    await refresh(phone.refreshToken)
      .expect(401)
      .expect(hasCode('INVALID_REFRESH_TOKEN'));
    await refreshed(laptop.refreshToken);
  });

  it('logout accepts unknown tokens, so it is safe to retry', async () => {
    await api()
      .post('/api/auth/logout')
      .send({ refreshToken: 'already-gone' })
      .expect(204);
  });

  it('logout-all ends every session of the user, and only theirs', async () => {
    const phone = await login();
    const laptop = await login();
    const someoneElse = await login('other@trek.test');

    await api().post('/api/auth/logout-all').expect(401);
    await api()
      .post('/api/auth/logout-all')
      .set(auth(phone.accessToken))
      .expect(204);

    await refresh(phone.refreshToken).expect(401);
    await refresh(laptop.refreshToken).expect(401);
    await refreshed(someoneElse.refreshToken);
  });

  it('signs refreshed access tokens with the current role', async () => {
    const tokens = await login();
    await api()
      .post('/api/destinations')
      .set(auth(tokens.accessToken))
      .send({ name: 'Kigali', city: 'Kigali', country: 'Rwanda' })
      .expect(403);

    await ctx.prisma.user.update({
      where: { email: 'user@trek.test' },
      data: { role: 'ADMIN' },
    });
    const promoted = await refreshed(tokens.refreshToken);

    await api()
      .post('/api/destinations')
      .set(auth(promoted.accessToken))
      .send({ name: 'Kigali', city: 'Kigali', country: 'Rwanda' })
      .expect(201);
    await ctx.prisma.user.update({
      where: { email: 'user@trek.test' },
      data: { role: 'USER' },
    });
  });

  it('deleting a user ends their sessions', async () => {
    await ctx.signUp('leaving@trek.test');
    const tokens = await login('leaving@trek.test');
    const { id } = (await me(tokens.accessToken).expect(200)).body.data as {
      id: string;
    };

    await api()
      .delete(`/api/users/${id}`)
      .set(auth(tokens.accessToken))
      .expect(200);

    await refresh(tokens.refreshToken)
      .expect(401)
      .expect(hasCode('INVALID_REFRESH_TOKEN'));
  });
});
