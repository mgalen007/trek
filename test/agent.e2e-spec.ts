// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { auth, createTestApp, day, hasCode } from './utils';

type Event = { type: string; actorId: string; viaAgent: boolean };

describe('Agent tokens (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let user: string;
  let userId: string;
  let agent: string;
  let kigaliId: string;
  let hotelId: string;

  const api = () => ctx.api();
  const as = (token: string) => ({
    get: (path: string) => api().get(path).set(auth(token)),
    post: (path: string, body: object = {}) =>
      api().post(path).set(auth(token)).send(body),
    put: (path: string, body: object) =>
      api().put(path).set(auth(token)).send(body),
    delete: (path: string) => api().delete(path).set(auth(token)),
  });
  const agentTokenFor = async (token: string) =>
    (await as(token).post('/api/auth/agent-token').expect(200)).body.data
      .accessToken as string;
  const draftWithHotel = async (token: string) => {
    const trip = (
      await as(token)
        .post('/api/itineraries', {
          name: 'Drafted by the assistant',
          destinationId: kigaliId,
          startDate: day(30),
          endDate: day(33),
        })
        .expect(201)
    ).body.data.id as string;
    await as(token)
      .post(`/api/itineraries/${trip}/hotels`, {
        hotelId,
        checkInDate: day(30),
        checkOutDate: day(33),
        rooms: 1,
      })
      .expect(201);
    return trip;
  };
  const notAllowed = hasCode('AGENT_NOT_ALLOWED');

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.signUp('admin@trek.test', 'ADMIN');
    user = await ctx.signUp('ada@trek.test');
    userId = (await as(user).get('/api/auth/me').expect(200)).body.data
      .id as string;
    agent = await agentTokenFor(user);

    kigaliId = (
      await as(admin)
        .post('/api/destinations', {
          name: 'Kigali',
          city: 'Kigali',
          country: 'Rwanda',
        })
        .expect(201)
    ).body.data.id as string;
    hotelId = (
      await as(admin)
        .post('/api/hotels', {
          destinationId: kigaliId,
          name: 'Hill View',
          address: 'KN 1 St',
          nightlyRate: 100,
          currency: 'USD',
          totalRooms: 5,
        })
        .expect(201)
    ).body.data.id as string;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('issues a short-lived bearer token for the agent', async () => {
    const res = await as(user).post('/api/auth/agent-token').expect(200);

    expect(res.body.data).toMatchObject({ tokenType: 'Bearer' });
    expect(res.body.data.expiresIn).toBe(15 * 60);
    expect(res.body.data).not.toHaveProperty('refreshToken');
  });

  it('acts as the user: reads the profile, catalogue and own data', async () => {
    const me = await as(agent).get('/api/auth/me').expect(200);
    expect(me.body.data.id).toBe(userId);

    await as(agent).get('/api/destinations').expect(200);
    await as(agent).get(`/api/hotels?destinationId=${kigaliId}`).expect(200);
    await as(agent).get('/api/flights').expect(200);
    await as(agent).get('/api/users/me/preferences').expect(200);
    await as(agent).get('/api/travelers').expect(200);
  });

  it('drafts itineraries, recorded as done via the agent', async () => {
    const trip = await draftWithHotel(agent);
    await as(agent)
      .put(`/api/itineraries/${trip}`, { name: 'Renamed by the assistant' })
      .expect(200);

    const owned = await as(user).get(`/api/itineraries/${trip}`).expect(200);
    expect(owned.body.data.userId).toBe(userId);

    const events = (
      await as(user).get(`/api/itineraries/${trip}/events`).expect(200)
    ).body.data as Event[];
    expect(events.map((e) => e.type)).toEqual([
      'UPDATED',
      'HOTEL_ADDED',
      'CREATED',
    ]);
    for (const event of events)
      expect(event).toMatchObject({ actorId: userId, viaAgent: true });
  });

  it('cannot confirm or cancel; the user does that', async () => {
    const trip = await draftWithHotel(agent);

    await as(agent)
      .post(`/api/itineraries/${trip}/confirm`)
      .expect(403)
      .expect(notAllowed);
    expect(
      (await as(user).get(`/api/itineraries/${trip}`)).body.data.status,
    ).toBe('DRAFT');

    await as(user).post(`/api/itineraries/${trip}/confirm`).expect(200);
    await as(agent)
      .post(`/api/itineraries/${trip}/cancel`)
      .expect(403)
      .expect(notAllowed);

    const [confirmed] = (
      await as(user).get(`/api/itineraries/${trip}/events`).expect(200)
    ).body.data as Event[];
    expect(confirmed).toMatchObject({ type: 'CONFIRMED', viaAgent: false });
  });

  it('can delete drafts but not cancelled trips', async () => {
    const draft = await draftWithHotel(agent);
    await as(agent).delete(`/api/itineraries/${draft}`).expect(200);

    const trip = await draftWithHotel(user);
    await as(user).post(`/api/itineraries/${trip}/confirm`).expect(200);
    await as(user).post(`/api/itineraries/${trip}/cancel`).expect(200);
    await as(agent)
      .delete(`/api/itineraries/${trip}`)
      .expect(403)
      .expect(notAllowed);
  });

  it.each([
    ['change the password', 'post', '/api/auth/change-password'],
    ['log out everywhere', 'post', '/api/auth/logout-all'],
    ['mint itself a new token', 'post', '/api/auth/agent-token'],
    ['resend verification', 'post', '/api/auth/resend-verification'],
    ['edit preferences', 'put', '/api/users/me/preferences'],
    ['add travelers', 'post', '/api/travelers'],
    ['read the user record', 'get', '/api/users/:id'],
  ] as const)('cannot %s', async (_what, method, path) => {
    const url = path.replace(':id', userId);
    const req =
      method === 'get'
        ? as(agent).get(url)
        : method === 'put'
          ? as(agent).put(url, {})
          : as(agent).post(url, {});

    await req.expect(403).expect(notAllowed);
  });

  it("an admin's agent has no admin rights", async () => {
    const adminAgent = await agentTokenFor(admin);

    await as(adminAgent)
      .post('/api/destinations', {
        name: 'Nairobi',
        city: 'Nairobi',
        country: 'Kenya',
      })
      .expect(403)
      .expect(notAllowed);

    // Someone else's itinerary, which the admin could read, stays hidden.
    const trip = await draftWithHotel(user);
    await as(admin).get(`/api/itineraries/${trip}`).expect(200);
    await as(adminAgent).get(`/api/itineraries/${trip}`).expect(404);
  });

  it('is refused once tampered with', async () => {
    const [header, payload, signature] = agent.split('.');
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as Record<string, unknown>;
    delete claims.kind;
    const forged = [
      header,
      Buffer.from(JSON.stringify(claims)).toString('base64url'),
      signature,
    ].join('.');

    await as(forged).post('/api/itineraries/x/confirm').expect(401);
  });
});

describe('Agent rate limits (e2e)', () => {
  it("has its own budget, so a busy agent can't lock the user out", async () => {
    const saved = process.env.RATE_LIMIT_PER_MINUTE;
    process.env.RATE_LIMIT_PER_MINUTE = '4';
    const ctx = await createTestApp();
    try {
      // Register + login count against the IP, not the user.
      const user = await ctx.signUp('busy@trek.test');
      const agent = (
        await ctx
          .api()
          .post('/api/auth/agent-token')
          .set(auth(user))
          .expect(200)
      ).body.data.accessToken as string;

      for (let i = 0; i < 4; i++)
        await ctx.api().get('/api/destinations').set(auth(agent)).expect(200);
      await ctx
        .api()
        .get('/api/destinations')
        .set(auth(agent))
        .expect(429)
        .expect(hasCode('TOO_MANY_REQUESTS'));

      // 1 of the user's 4 went to minting the agent token.
      await ctx.api().get('/api/destinations').set(auth(user)).expect(200);
    } finally {
      await ctx.app.close();
      process.env.RATE_LIMIT_PER_MINUTE = saved;
    }
  });
});
