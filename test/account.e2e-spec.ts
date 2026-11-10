// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { MaintenanceService } from '../src/jobs/maintenance.service';
import { auth, createTestApp, hasCode, PASSWORD } from './utils';

const NEW_PASSWORD = 'new-password-456';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Account security (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const api = () => ctx.api();

  // The newest code emailed to `to` with the given template, read from the
  // outbox (the e2e env has no APP_URL, so emails show bare codes).
  const codeFrom = async (to: string, template: string) => {
    const email = await ctx.prisma.emailOutbox.findFirstOrThrow({
      where: { to, template },
      orderBy: { createdAt: 'desc' },
    });
    const match = /Your code: ([\w-]+)/.exec(email.text);
    if (!match) throw new Error(`No code in ${template} email`);
    return match[1];
  };
  const emailCount = (to: string, template: string) =>
    ctx.prisma.emailOutbox.count({ where: { to, template } });
  const login = (email: string, password: string) =>
    api().post('/api/auth/login').send({ email, password });
  const me = async (token: string) =>
    (await api().get('/api/auth/me').set(auth(token)).expect(200)).body
      .data as { id: string; email: string; emailVerifiedAt: string | null };
  // Lets the next code be issued without waiting out the 1-minute cooldown.
  const skipCooldown = () =>
    ctx.prisma.accountToken.updateMany({
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('email verification', () => {
    it('sends a code on registration that verifies the address once', async () => {
      const token = await ctx.signUp('ada@trek.test');
      expect((await me(token)).emailVerifiedAt).toBeNull();

      const code = await codeFrom('ada@trek.test', 'WELCOME');
      await api()
        .post('/api/auth/verify-email')
        .send({ token: code })
        .expect(204);
      expect((await me(token)).emailVerifiedAt).not.toBeNull();

      await api()
        .post('/api/auth/verify-email')
        .send({ token: code })
        .expect(400)
        .expect(hasCode('INVALID_VERIFICATION_TOKEN'));
    });

    it('rejects unknown and expired codes', async () => {
      await api()
        .post('/api/auth/verify-email')
        .send({ token: 'not-a-code' })
        .expect(400)
        .expect(hasCode('INVALID_VERIFICATION_TOKEN'));

      await ctx.signUp('late@trek.test');
      const code = await codeFrom('late@trek.test', 'WELCOME');
      await ctx.prisma.accountToken.updateMany({
        where: { email: 'late@trek.test' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await api()
        .post('/api/auth/verify-email')
        .send({ token: code })
        .expect(400)
        .expect(hasCode('INVALID_VERIFICATION_TOKEN'));
    });

    it('resends at most once a minute, and not once verified', async () => {
      const token = await ctx.signUp('bob@trek.test');
      await skipCooldown();
      const resend = () =>
        api().post('/api/auth/resend-verification').set(auth(token));

      await resend().expect(204);
      await resend().expect(204);
      expect(await emailCount('bob@trek.test', 'VERIFY_EMAIL')).toBe(1);

      const code = await codeFrom('bob@trek.test', 'VERIFY_EMAIL');
      await api()
        .post('/api/auth/verify-email')
        .send({ token: code })
        .expect(204);
      await resend().expect(409).expect(hasCode('EMAIL_ALREADY_VERIFIED'));
    });

    it('a new address starts unverified, and old codes no longer work', async () => {
      const token = await ctx.signUp('carol@trek.test');
      const oldCode = await codeFrom('carol@trek.test', 'WELCOME');
      const { id } = await me(token);

      await api()
        .put(`/api/users/${id}`)
        .set(auth(token))
        .send({ email: 'carol@new.test' })
        .expect(200);

      const after = await me(token);
      expect(after).toMatchObject({
        email: 'carol@new.test',
        emailVerifiedAt: null,
      });
      // The old address is told, the new one gets a code.
      expect(await emailCount('carol@trek.test', 'EMAIL_CHANGED')).toBe(1);
      await api()
        .post('/api/auth/verify-email')
        .send({ token: oldCode })
        .expect(400)
        .expect(hasCode('INVALID_VERIFICATION_TOKEN'));

      const newCode = await codeFrom('carol@new.test', 'VERIFY_EMAIL');
      await api()
        .post('/api/auth/verify-email')
        .send({ token: newCode })
        .expect(204);
      expect((await me(token)).emailVerifiedAt).not.toBeNull();
    });

    it('keeps the verification when the email is saved unchanged', async () => {
      const token = await ctx.signUp('dan@trek.test');
      const code = await codeFrom('dan@trek.test', 'WELCOME');
      await api()
        .post('/api/auth/verify-email')
        .send({ token: code })
        .expect(204);
      const { id } = await me(token);

      await api()
        .put(`/api/users/${id}`)
        .set(auth(token))
        .send({ email: 'dan@trek.test', firstName: 'Daniel' })
        .expect(200);

      expect((await me(token)).emailVerifiedAt).not.toBeNull();
      expect(await emailCount('dan@trek.test', 'EMAIL_CHANGED')).toBe(0);
    });
  });

  describe('password reset', () => {
    const forgot = (email: string) =>
      api().post('/api/auth/forgot-password').send({ email });
    const reset = (token: string, newPassword = NEW_PASSWORD) =>
      api().post('/api/auth/reset-password').send({ token, newPassword });

    it('answers the same for unknown addresses, and sends nothing', async () => {
      await forgot('nobody@trek.test').expect(204);
      expect(await emailCount('nobody@trek.test', 'PASSWORD_RESET')).toBe(0);
    });

    it('resets the password with the emailed code and signs out everywhere', async () => {
      await ctx.signUp('erin@trek.test');
      const session = (await login('erin@trek.test', PASSWORD).expect(200)).body
        .data as { refreshToken: string };

      await forgot('erin@trek.test').expect(204);
      await forgot('erin@trek.test').expect(204);
      // The second request within a minute sent nothing.
      expect(await emailCount('erin@trek.test', 'PASSWORD_RESET')).toBe(1);

      const code = await codeFrom('erin@trek.test', 'PASSWORD_RESET');
      await reset(code).expect(204);

      await login('erin@trek.test', PASSWORD)
        .expect(401)
        .expect(hasCode('INVALID_CREDENTIALS'));
      const fresh = (await login('erin@trek.test', NEW_PASSWORD).expect(200))
        .body.data as { accessToken: string };
      await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      expect(await emailCount('erin@trek.test', 'PASSWORD_CHANGED')).toBe(1);
      // The code proved access to the inbox.
      expect((await me(fresh.accessToken)).emailVerifiedAt).not.toBeNull();

      await reset(code, 'another-password')
        .expect(400)
        .expect(hasCode('INVALID_RESET_TOKEN'));
    });

    it('only accepts the newest code, before it expires', async () => {
      await ctx.signUp('finn@trek.test');
      await forgot('finn@trek.test').expect(204);
      const first = await codeFrom('finn@trek.test', 'PASSWORD_RESET');
      await skipCooldown();
      await forgot('finn@trek.test').expect(204);
      const second = await codeFrom('finn@trek.test', 'PASSWORD_RESET');

      await reset(first).expect(400).expect(hasCode('INVALID_RESET_TOKEN'));

      await ctx.prisma.accountToken.updateMany({
        where: { email: 'finn@trek.test', purpose: 'PASSWORD_RESET' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await reset(second).expect(400).expect(hasCode('INVALID_RESET_TOKEN'));
    });

    it('validates the new password', async () => {
      await reset('whatever', 'short')
        .expect(400)
        .expect(hasCode('VALIDATION_FAILED'));
      await reset('whatever', 'x'.repeat(73))
        .expect(400)
        .expect(hasCode('VALIDATION_FAILED'));
    });
  });

  describe('change password', () => {
    it('needs the current password', async () => {
      const token = await ctx.signUp('gus@trek.test');

      await api()
        .post('/api/auth/change-password')
        .set(auth(token))
        .send({ currentPassword: 'wrong-password', newPassword: NEW_PASSWORD })
        .expect(400)
        .expect(hasCode('INVALID_CREDENTIALS'));
      await api()
        .post('/api/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('changes it, ends other sessions and returns a new one', async () => {
      const token = await ctx.signUp('hana@trek.test');
      const other = (await login('hana@trek.test', PASSWORD).expect(200)).body
        .data as { refreshToken: string };

      const res = await api()
        .post('/api/auth/change-password')
        .set(auth(token))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);
      const session = res.body.data as {
        accessToken: string;
        refreshToken: string;
      };

      await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: other.refreshToken })
        .expect(401);
      await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      await me(session.accessToken);
      await login('hana@trek.test', PASSWORD).expect(401);
      await login('hana@trek.test', NEW_PASSWORD).expect(200);
      expect(await emailCount('hana@trek.test', 'PASSWORD_CHANGED')).toBe(1);
    });
  });

  it('purges codes a day after they expire or are used', async () => {
    await ctx.prisma.accountToken.deleteMany();
    const user = await ctx.prisma.user.findFirstOrThrow();
    const token = (n: number, fields: { expiresAt: Date; usedAt?: Date }) => ({
      userId: user.id,
      purpose: 'PASSWORD_RESET' as const,
      email: user.email,
      tokenHash: `hash-${n}`,
      ...fields,
    });
    const now = Date.now();
    await ctx.prisma.accountToken.createMany({
      data: [
        token(1, { expiresAt: new Date(now - 2 * DAY_MS) }),
        token(2, {
          expiresAt: new Date(now + DAY_MS),
          usedAt: new Date(now - 2 * DAY_MS),
        }),
        token(3, { expiresAt: new Date(now - 1000) }),
        token(4, { expiresAt: new Date(now + DAY_MS) }),
      ],
    });

    await expect(
      ctx.app.get(MaintenanceService).purgeAccountTokens(),
    ).resolves.toBe(2);
    expect(await ctx.prisma.accountToken.count()).toBe(2);
  });
});
