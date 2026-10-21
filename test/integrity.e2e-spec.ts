// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { auth, createTestApp, day, hasCode } from './utils';

describe('Privacy & data integrity (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let alice: string;
  let bob: string;
  let aliceId: string;
  let bobId: string;

  let kigaliId: string;
  let nboId: string;
  let kglId: string;
  let hotelId: string;
  let flightId: string;

  const api = () => ctx.api();
  const as = (token: string) => ({
    get: (path: string) => api().get(path).set(auth(token)),
    post: (path: string, body: object = {}) =>
      api().post(path).set(auth(token)).send(body),
    put: (path: string, body: object) =>
      api().put(path).set(auth(token)).send(body),
    delete: (path: string) => api().delete(path).set(auth(token)),
  });
  const create = async (path: string, body: object) =>
    (await as(admin).post(path, body).expect(201)).body.data.id as string;
  const meId = async (token: string) =>
    (await as(token).get('/api/auth/me').expect(200)).body.data.id as string;

  // A confirmed trip for `token`: `rooms` at the hotel for nights 30-32 and
  // `passengers` on the flight.
  const bookTrip = async (token: string, rooms: number, passengers: number) => {
    const trip = (
      await as(token)
        .post('/api/itineraries', {
          name: 'Trip',
          destinationId: kigaliId,
          startDate: day(30),
          endDate: day(35),
        })
        .expect(201)
    ).body.data.id as string;
    if (rooms)
      await as(token)
        .post(`/api/itineraries/${trip}/hotels`, {
          hotelId,
          checkInDate: day(30),
          checkOutDate: day(33),
          rooms,
        })
        .expect(201);
    if (passengers)
      await as(token)
        .post(`/api/itineraries/${trip}/flights`, { flightId, passengers })
        .expect(201);
    await as(token).post(`/api/itineraries/${trip}/confirm`).expect(200);
    return trip;
  };
  const flight = async () =>
    (await as(admin).get(`/api/flights/${flightId}`).expect(200)).body.data as {
      airline: string;
      totalSeats: number;
      availableSeats: number;
    };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.signUp('admin@trek.test', 'ADMIN');
    alice = await ctx.signUp('alice@trek.test');
    bob = await ctx.signUp('bob@trek.test');
    aliceId = await meId(alice);
    bobId = await meId(bob);

    kigaliId = await create('/api/destinations', {
      name: 'Kigali',
      city: 'Kigali',
      country: 'Rwanda',
    });
    const nairobiId = await create('/api/destinations', {
      name: 'Nairobi',
      city: 'Nairobi',
      country: 'Kenya',
    });
    nboId = await create('/api/airports', {
      destinationId: nairobiId,
      code: 'NBO',
      name: 'Jomo Kenyatta International',
    });
    kglId = await create('/api/airports', {
      destinationId: kigaliId,
      code: 'KGL',
      name: 'Kigali International',
    });
    hotelId = await create('/api/hotels', {
      destinationId: kigaliId,
      name: 'Hill View',
      address: 'KN 1 St',
      nightlyRate: 100,
      currency: 'USD',
      totalRooms: 3,
    });
    flightId = await create('/api/flights', {
      departureAirportId: nboId,
      arrivalAirportId: kglId,
      airline: 'RwandAir',
      flightNumber: 'WB101',
      departureAt: `${day(30)}T08:00:00Z`,
      arrivalAt: `${day(30)}T10:00:00Z`,
      price: 100,
      currency: 'USD',
      totalSeats: 5,
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('user profiles', () => {
    it("hides other users' profiles", async () => {
      await as(alice).get(`/api/users/${bobId}`).expect(404);
      await as(alice)
        .put(`/api/users/${bobId}`, { firstName: 'Mallory' })
        .expect(404);
      await as(alice).delete(`/api/users/${bobId}`).expect(404);
    });

    it('lets users read themselves and admins read anyone', async () => {
      const me = await as(alice).get(`/api/users/${aliceId}`).expect(200);
      expect(me.body.data.email).toBe('alice@trek.test');

      await as(admin).get(`/api/users/${bobId}`).expect(200);
    });
  });

  describe('flight capacity', () => {
    it('starts with every seat available', async () => {
      expect(await flight()).toMatchObject({
        totalSeats: 5,
        availableSeats: 5,
      });
    });

    it('moves available seats with capacity, never below bookings', async () => {
      await bookTrip(bob, 0, 3);
      expect(await flight()).toMatchObject({
        totalSeats: 5,
        availableSeats: 2,
      });

      await as(admin)
        .put(`/api/flights/${flightId}`, { totalSeats: 4 })
        .expect(200);
      expect(await flight()).toMatchObject({
        totalSeats: 4,
        availableSeats: 1,
      });

      const res = await as(admin)
        .put(`/api/flights/${flightId}`, { totalSeats: 2 })
        .expect(409)
        .expect(hasCode('CAPACITY_BELOW_BOOKINGS'));
      expect(res.body.error.details).toEqual({ booked: 3 });

      await as(admin)
        .put(`/api/flights/${flightId}`, { totalSeats: 3 })
        .expect(200);
      expect(await flight()).toMatchObject({
        totalSeats: 3,
        availableSeats: 0,
      });
    });

    it('applies none of an update whose capacity is rejected', async () => {
      await as(admin)
        .put(`/api/flights/${flightId}`, { totalSeats: 1, airline: 'Changed' })
        .expect(409);

      expect(await flight()).toMatchObject({
        airline: 'RwandAir',
        totalSeats: 3,
      });
    });

    it('no longer accepts availableSeats as input', async () => {
      await as(admin)
        .put(`/api/flights/${flightId}`, { availableSeats: 99 })
        .expect(400)
        .expect(hasCode('VALIDATION_FAILED'));
    });
  });

  describe('hotel capacity', () => {
    it("can't drop below the busiest booked night", async () => {
      await bookTrip(bob, 2, 0);

      const res = await as(admin)
        .put(`/api/hotels/${hotelId}`, { totalRooms: 1 })
        .expect(409)
        .expect(hasCode('CAPACITY_BELOW_BOOKINGS'));
      expect(res.body.error.details).toEqual({ booked: 2 });

      await as(admin)
        .put(`/api/hotels/${hotelId}`, { totalRooms: 2 })
        .expect(200);
    });
  });

  describe('deleting catalogue records', () => {
    it.each([
      ['hotel', () => `/api/hotels/${hotelId}`, { bookings: 1 }],
      ['flight', () => `/api/flights/${flightId}`, { bookings: 1 }],
      ['airport', () => `/api/airports/${kglId}`, { flights: 1 }],
      [
        'destination',
        () => `/api/destinations/${kigaliId}`,
        { hotels: 1, airports: 1, itineraries: 2 },
      ],
    ])(
      'refuses to delete a %s that is still used',
      async (_what, path, usage) => {
        const res = await as(admin)
          .delete(path())
          .expect(409)
          .expect(hasCode('RESOURCE_IN_USE'));

        expect(res.body.error.details).toEqual(usage);
      },
    );

    it('deletes unused records, clearing home airport preferences', async () => {
      const spareAirport = await create('/api/airports', {
        destinationId: kigaliId,
        code: 'HRY',
        name: 'Spare Airport',
      });
      await as(alice)
        .put('/api/users/me/preferences', { homeAirportId: spareAirport })
        .expect(200);

      await as(admin).delete(`/api/airports/${spareAirport}`).expect(200);

      const prefs = await as(alice)
        .get('/api/users/me/preferences')
        .expect(200);
      expect(prefs.body.data.homeAirportId).toBeNull();
    });
  });

  describe('deleting users', () => {
    it('blocks while the user has upcoming confirmed trips', async () => {
      await as(bob)
        .delete(`/api/users/${bobId}`)
        .expect(409)
        .expect(hasCode('HAS_ACTIVE_BOOKINGS'));
    });

    it('deletes the user and their trips once those are cancelled', async () => {
      const trips = (await as(bob).get('/api/itineraries').expect(200)).body
        .data as { id: string }[];
      for (const trip of trips)
        await as(bob).post(`/api/itineraries/${trip.id}/cancel`).expect(200);

      await as(bob).delete(`/api/users/${bobId}`).expect(200);

      await as(admin).get(`/api/users/${bobId}`).expect(404);
      await as(admin).get(`/api/itineraries/${trips[0].id}`).expect(404);
      // Cancelling released the seats before the bookings were deleted.
      expect(await flight()).toMatchObject({
        totalSeats: 3,
        availableSeats: 3,
      });
    });

    it('deletes users who only have drafts', async () => {
      await as(alice)
        .post('/api/itineraries', {
          name: 'Someday',
          destinationId: kigaliId,
          startDate: day(60),
          endDate: day(62),
        })
        .expect(201);

      await as(alice).delete(`/api/users/${aliceId}`).expect(200);
      await as(admin).get(`/api/users/${aliceId}`).expect(404);
    });
  });
});
