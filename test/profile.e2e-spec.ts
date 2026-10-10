// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { randomUUID } from 'crypto';
import { auth, createTestApp, day, hasCode } from './utils';

describe('Preferences & travelers (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let alice: string;
  let bob: string;

  let kigaliId: string;
  let nboId: string;
  let flightId: string;
  let aliceId: string;
  let benId: string;

  const api = () => ctx.api();
  const adminPost = async (path: string, body: object) => {
    const res = await api().post(path).set(auth(admin)).send(body).expect(201);
    return res.body.data.id as string;
  };
  const putPrefs = (token: string, body: object) =>
    api().put('/api/users/me/preferences').set(auth(token)).send(body);
  const createTrip = async (token: string) => {
    const res = await api()
      .post('/api/itineraries')
      .set(auth(token))
      .send({
        name: 'Trip',
        destinationId: kigaliId,
        startDate: day(30),
        endDate: day(35),
      })
      .expect(201);
    return res.body.data.id as string;
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
    nboId = await adminPost('/api/airports', {
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
      departureAirportId: nboId,
      arrivalAirportId: kgl,
      airline: 'RwandAir',
      flightNumber: 'WB101',
      departureAt: `${day(30)}T08:00:00Z`,
      arrivalAt: `${day(30)}T10:00:00Z`,
      price: 100,
      currency: 'USD',
      availableSeats: 5,
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('preferences', () => {
    it('starts with defaults', async () => {
      const res = await api()
        .get('/api/users/me/preferences')
        .set(auth(alice))
        .expect(200);

      expect(res.body.data).toMatchObject({
        homeAirportId: null,
        homeAirport: null,
        currency: null,
        maxNightlyRate: null,
        minHotelRating: null,
        defaultTravelers: 1,
        notes: null,
      });
    });

    it('updates only the fields sent', async () => {
      const res = await putPrefs(alice, {
        homeAirportId: nboId,
        currency: 'usd',
        maxNightlyRate: 150,
        defaultTravelers: 2,
        notes: 'Aisle seat, quiet hotels',
      }).expect(200);

      expect(res.body.data).toMatchObject({
        currency: 'USD',
        maxNightlyRate: '150',
        defaultTravelers: 2,
        homeAirport: { code: 'NBO' },
      });

      const cleared = await putPrefs(alice, { notes: null }).expect(200);
      expect(cleared.body.data).toMatchObject({
        notes: null,
        currency: 'USD',
        defaultTravelers: 2,
      });
    });

    it.each([
      [
        'a null defaultTravelers',
        { defaultTravelers: null },
        'VALIDATION_FAILED',
      ],
      ['an unknown currency', { currency: 'XYZ' }, 'VALIDATION_FAILED'],
      [
        'an unknown airport',
        { homeAirportId: randomUUID() },
        'INVALID_REFERENCE',
      ],
    ])('rejects %s', async (_case, body, code) => {
      await putPrefs(alice, body).expect(400).expect(hasCode(code));
    });

    it('keeps each user’s preferences separate', async () => {
      const res = await api()
        .get('/api/users/me/preferences')
        .set(auth(bob))
        .expect(200);

      expect(res.body.data).toMatchObject({
        currency: null,
        defaultTravelers: 1,
      });
    });
  });

  describe('travelers', () => {
    const create = (token: string, body: object) =>
      api().post('/api/travelers').set(auth(token)).send(body);

    it('adds travelers with normalized dates and country codes', async () => {
      const res = await create(alice, {
        firstName: 'Alice',
        lastName: 'Smith',
        dateOfBirth: '1990-04-21',
        nationality: 'rw',
      }).expect(201);

      expect(res.body.data).toMatchObject({
        nationality: 'RW',
        dateOfBirth: '1990-04-21T00:00:00.000Z',
      });
      aliceId = res.body.data.id;

      benId = (
        await create(alice, {
          firstName: 'Ben',
          lastName: 'Smith',
          dateOfBirth: '2015-09-02',
          nationality: 'KE',
        }).expect(201)
      ).body.data.id;
    });

    it.each([
      ['a future birth date', { dateOfBirth: day(1) }],
      ['an unknown country', { nationality: 'XX' }],
      ['a missing name', { firstName: '' }],
    ])('rejects %s', async (_case, override) => {
      await create(alice, {
        firstName: 'Carl',
        lastName: 'Smith',
        dateOfBirth: '1980-01-01',
        nationality: 'RW',
        ...override,
      })
        .expect(400)
        .expect(hasCode('VALIDATION_FAILED'));
    });

    it("lists only the caller's travelers", async () => {
      const mine = await api().get('/api/travelers').set(auth(alice));
      expect(
        mine.body.data.map((t: { firstName: string }) => t.firstName),
      ).toEqual(['Alice', 'Ben']);
      expect(mine.body.pagination.total).toBe(2);

      const bobs = await api().get('/api/travelers').set(auth(bob));
      expect(bobs.body.data).toHaveLength(0);
    });

    it("hides other users' travelers", async () => {
      await api().get(`/api/travelers/${aliceId}`).set(auth(bob)).expect(404);
      await api()
        .put(`/api/travelers/${aliceId}`)
        .set(auth(bob))
        .send({ lastName: 'Hacked' })
        .expect(404);
    });

    it('updates a traveler', async () => {
      const res = await api()
        .put(`/api/travelers/${benId}`)
        .set(auth(alice))
        .send({ lastName: 'Jones' })
        .expect(200);

      expect(res.body.data).toMatchObject({
        firstName: 'Ben',
        lastName: 'Jones',
      });
    });
  });

  describe('named passengers on flight bookings', () => {
    let trip: string;
    const addFlight = (token: string, tripId: string, body: object) =>
      api()
        .post(`/api/itineraries/${tripId}/flights`)
        .set(auth(token))
        .send({ flightId, ...body });

    it('derives passengers from travelerIds and lists the travelers', async () => {
      trip = await createTrip(alice);

      const res = await addFlight(alice, trip, {
        travelerIds: [aliceId, benId],
      }).expect(201);

      const booking = res.body.data.itineraryFlight[0];
      expect(booking.passengers).toBe(2);
      expect(booking.totalPrice).toBe('200');
      expect(
        booking.travelers.map((t: { lastName: string }) => t.lastName),
      ).toEqual(['Jones', 'Smith']);
    });

    // Payloads are functions: traveler ids only exist once earlier tests ran.
    it.each([
      ['neither passengers nor travelerIds', () => ({}), 'BAD_REQUEST'],
      [
        'a count that does not match',
        () => ({ passengers: 3, travelerIds: [aliceId] }),
        'BAD_REQUEST',
      ],
      [
        'duplicate travelers',
        () => ({ travelerIds: [aliceId, aliceId] }),
        'VALIDATION_FAILED',
      ],
    ])('rejects %s', async (_case, payload, code) => {
      await addFlight(alice, trip, payload()).expect(400).expect(hasCode(code));
    });

    it("refuses someone else's travelers", async () => {
      const bobTrip = await createTrip(bob);

      await addFlight(bob, bobTrip, { travelerIds: [aliceId] })
        .expect(400)
        .expect(hasCode('INVALID_REFERENCE'));
    });

    it('protects travelers on active bookings from deletion', async () => {
      await api()
        .delete(`/api/travelers/${benId}`)
        .set(auth(alice))
        .expect(409)
        .expect(hasCode('TRAVELER_IN_USE'));

      await api()
        .post(`/api/itineraries/${trip}/confirm`)
        .set(auth(alice))
        .expect(200);
      await api()
        .delete(`/api/travelers/${benId}`)
        .set(auth(alice))
        .expect(409);

      await api()
        .post(`/api/itineraries/${trip}/cancel`)
        .set(auth(alice))
        .expect(200);
      await api()
        .delete(`/api/travelers/${benId}`)
        .set(auth(alice))
        .expect(200);

      const after = await api()
        .get(`/api/itineraries/${trip}`)
        .set(auth(alice))
        .expect(200);
      expect(
        after.body.data.itineraryFlight[0].travelers.map(
          (t: { id: string }) => t.id,
        ),
      ).toEqual([aliceId]);
    });
  });
});
