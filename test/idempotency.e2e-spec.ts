// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { randomUUID } from 'crypto';
import { auth, createTestApp, day, hasCode } from './utils';

describe('Idempotency keys (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let alice: string;
  let bob: string;
  let kigaliId: string;
  let flightId: string;

  const api = () => ctx.api();
  const adminPost = async (path: string, body: object) => {
    const res = await api().post(path).set(auth(admin)).send(body).expect(201);
    return res.body.data.id as string;
  };
  const tripBody = (name = 'Trip') => ({
    name,
    destinationId: kigaliId,
    startDate: day(30),
    endDate: day(35),
  });
  const createTrip = (token: string, key?: string, body = tripBody()) => {
    const req = api().post('/api/itineraries').set(auth(token));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const tripCount = async (token: string) => {
    const res = await api().get('/api/itineraries').set(auth(token));
    return res.body.pagination.total as number;
  };
  const seatsLeft = async () => {
    const res = await api().get(`/api/flights/${flightId}`).set(auth(admin));
    return res.body.data.availableSeats as number;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.signUp('admin@trek.test', 'ADMIN');
    alice = await ctx.signUp('alice@trek.test');
    bob = await ctx.signUp('bob@trek.test');

    kigaliId = await adminPost('/api/destinations', {
      name: 'Kigali',
      city: 'Kigali',
      country: 'Rwanda',
    });
    const nairobiId = await adminPost('/api/destinations', {
      name: 'Nairobi',
      city: 'Nairobi',
      country: 'Kenya',
    });
    const nbo = await adminPost('/api/airports', {
      destinationId: nairobiId,
      code: 'NBO',
      name: 'Jomo Kenyatta International',
    });
    const kgl = await adminPost('/api/airports', {
      destinationId: kigaliId,
      code: 'KGL',
      name: 'Kigali International',
    });
    flightId = await adminPost('/api/flights', {
      departureAirportId: nbo,
      arrivalAirportId: kgl,
      airline: 'RwandAir',
      flightNumber: 'WB101',
      departureAt: `${day(30)}T08:00:00Z`,
      arrivalAt: `${day(30)}T10:00:00Z`,
      price: 100,
      currency: 'USD',
      availableSeats: 10,
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('replays the first response instead of creating twice', async () => {
    const key = randomUUID();
    const before = await tripCount(alice);

    const first = await createTrip(alice, key).expect(201);
    const retry = await createTrip(alice, key).expect(201);

    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(await tripCount(alice)).toBe(before + 1);
  });

  it('treats the same body with reordered keys as the same request', async () => {
    const key = randomUUID();
    const body = tripBody();
    const reordered = {
      endDate: body.endDate,
      startDate: body.startDate,
      destinationId: body.destinationId,
      name: body.name,
    };

    const first = await createTrip(alice, key, body).expect(201);
    const retry = await createTrip(alice, key, reordered).expect(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
  });

  it('rejects reusing a key for a different request', async () => {
    const key = randomUUID();
    await createTrip(alice, key).expect(201);

    await createTrip(alice, key, tripBody('Another trip'))
      .expect(422)
      .expect(hasCode('IDEMPOTENCY_KEY_REUSED'));
  });

  it('scopes keys to each user', async () => {
    const key = randomUUID();
    const mine = await createTrip(alice, key).expect(201);
    const theirs = await createTrip(bob, key).expect(201);

    expect(theirs.body.data.id).not.toBe(mine.body.data.id);
    expect(theirs.headers['idempotent-replayed']).toBeUndefined();
  });

  it('forgets failed requests so the key can be retried', async () => {
    const key = randomUUID();
    const past = { ...tripBody(), startDate: day(-3) };

    await createTrip(alice, key, past).expect(400);
    // Same key, corrected request: runs normally rather than 422/replay.
    const fixed = await createTrip(alice, key).expect(201);
    expect(fixed.headers['idempotent-replayed']).toBeUndefined();
  });

  it('never runs without a key', async () => {
    const before = await tripCount(alice);
    await createTrip(alice).expect(201);
    await createTrip(alice).expect(201);

    expect(await tripCount(alice)).toBe(before + 2);
  });

  it.each([
    ['too long', 'k'.repeat(256)],
    ['containing spaces', 'my key'],
  ])('rejects a key %s', async (_case, key) => {
    await createTrip(alice, key).expect(400).expect(hasCode('BAD_REQUEST'));
  });

  describe('confirming a booking', () => {
    let trip: string;

    beforeAll(async () => {
      trip = (await createTrip(alice).expect(201)).body.data.id;
      await api()
        .post(`/api/itineraries/${trip}/flights`)
        .set(auth(alice))
        .send({ flightId, passengers: 2 })
        .expect(201);
    });

    const confirm = (key: string) =>
      api()
        .post(`/api/itineraries/${trip}/confirm`)
        .set(auth(alice))
        .set('Idempotency-Key', key);

    it('reserves seats once however many times it is retried', async () => {
      const key = randomUUID();
      const seats = await seatsLeft();

      await confirm(key).expect(200);
      const retry = await confirm(key).expect(200);
      await confirm(key).expect(200);

      expect(retry.body.data.status).toBe('PLANNED');
      expect(await seatsLeft()).toBe(seats - 2);
    });

    it('handles simultaneous retries without double booking', async () => {
      const cancelKey = randomUUID();
      const seats = await seatsLeft();

      const results = await Promise.all([
        api()
          .post(`/api/itineraries/${trip}/cancel`)
          .set(auth(alice))
          .set('Idempotency-Key', cancelKey),
        api()
          .post(`/api/itineraries/${trip}/cancel`)
          .set(auth(alice))
          .set('Idempotency-Key', cancelKey),
      ]);

      // One runs; the other is told to wait, or replays if the first finished.
      const statuses = results.map((r) => r.status).sort();
      expect([
        [200, 200],
        [200, 409],
      ]).toContainEqual(statuses);
      for (const r of results.filter((r) => r.status === 409))
        expect(r.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      expect(await seatsLeft()).toBe(seats + 2);
    });
  });
});
