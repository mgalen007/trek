// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { randomUUID } from 'crypto';
import { auth, createTestApp, hasCode, PASSWORD } from './utils';

describe('Response format (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let user: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await ctx.signUp('user@trek.test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('success', () => {
    it('wraps single resources in { data }', async () => {
      const res = await ctx
        .api()
        .get('/api/auth/me')
        .set(auth(user))
        .expect(200);

      expect(Object.keys(res.body as object)).toEqual(['data']);
      expect(res.body.data.email).toBe('user@trek.test');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('wraps lists in { data, pagination }', async () => {
      const res = await ctx
        .api()
        .get('/api/destinations')
        .set(auth(user))
        .expect(200);

      expect(res.body).toEqual({
        data: [],
        pagination: { page: 1, skip: 0, limit: 15, total: 0, totalPages: 0 },
      });
    });

    it('returns the token as data on login', async () => {
      const res = await ctx
        .api()
        .post('/api/auth/login')
        .send({ email: 'user@trek.test', password: PASSWORD })
        .expect(200);

      expect(typeof res.body.data.token).toBe('string');
    });
  });

  describe('errors', () => {
    it('uses { statusCode, error: { code, message } }', async () => {
      const res = await ctx
        .api()
        .get(`/api/destinations/${randomUUID()}`)
        .set(auth(user))
        .expect(404);

      expect(res.body).toEqual({
        statusCode: 404,
        error: { code: 'NOT_FOUND', message: 'Destination not found' },
      });
    });

    it('lists field-level validation errors', async () => {
      const res = await ctx
        .api()
        .post('/api/auth/register')
        .send({ email: 'not-an-email', firstName: 'Al', extra: true })
        .expect(400)
        .expect(hasCode('VALIDATION_FAILED'));

      const fields = (res.body.error.details as { field: string }[]).map(
        (d) => d.field,
      );
      expect(fields).toEqual(
        expect.arrayContaining([
          'email',
          'firstName',
          'lastName',
          'password',
          'extra',
        ]),
      );
    });

    it('flags wrong credentials distinctly from missing auth', async () => {
      await ctx
        .api()
        .post('/api/auth/login')
        .send({ email: 'user@trek.test', password: 'wrong-password' })
        .expect(401)
        .expect(hasCode('INVALID_CREDENTIALS'));
      await ctx
        .api()
        .get('/api/auth/me')
        .expect(401)
        .expect(hasCode('UNAUTHORIZED'));
    });

    it('reports forbidden, duplicates and unknown routes', async () => {
      await ctx
        .api()
        .post('/api/destinations')
        .set(auth(user))
        .send({ name: 'Kigali', city: 'Kigali', country: 'Rwanda' })
        .expect(403)
        .expect(hasCode('FORBIDDEN'));
      await ctx
        .api()
        .post('/api/auth/register')
        .send({
          email: 'user@trek.test',
          password: PASSWORD,
          firstName: 'Dup',
          lastName: 'User',
        })
        .expect(409)
        .expect(hasCode('ALREADY_EXISTS'));
      await ctx
        .api()
        .get('/api/nowhere')
        .expect(404)
        .expect(hasCode('NOT_FOUND'));
    });
  });
});
