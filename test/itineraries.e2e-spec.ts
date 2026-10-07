// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { auth, createTestApp, day } from './utils';

describe('Itineraries (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  let admin: string;
  let alice: string;
  let bob: string;

  let kigaliId: string;
  let hotelId: string;
  let tinyInnId: string;
  let nairobiHotelId: string;
  let flightId: string;

  let aliceTrip: string;
  let bobTrip: string;

  const api = () => ctx.api();
  const signUp = (email: string, role?: 'USER' | 'ADMIN') =>
    ctx.signUp(email, role);

  const adminPost = async (path: string, body: object) => {
    const res = await api().post(path).set(auth(admin)).send(body).expect(201);
    return res.body.id as string;
  };

  const createTrip = async (token: string, name = 'Kigali trip') => {
    const res = await api()
      .post('/api/itineraries')
      .set(auth(token))
      .send({
        name,
        destinationId: kigaliId,
        startDate: day(30),
        endDate: day(35),
      })
      .expect(201);
    return res.body.id as string;
  };

  const seatsLeft = async () => {
    const res = await api()
      .get(`/api/flights/${flightId}`)
      .set(auth(admin))
      .expect(200);
    return res.body.availableSeats as number;
  };

  beforeAll(async () => {
    ctx = await createTestApp();

    admin = await signUp('admin@trek.test', 'ADMIN');
    alice = await signUp('alice@trek.test');
    bob = await signUp('bob@trek.test');

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
      departureAt: `${day(30)}T08:00:00.000Z`,
      arrivalAt: `${day(30)}T10:00:00.000Z`,
      price: 250,
      currency: 'USD',
      availableSeats: 3,
    });
    hotelId = await adminPost('/api/hotels', {
      destinationId: kigaliId,
      name: 'Hill View',
      address: 'KN 1 St',
      nightlyRate: 100,
      currency: 'USD',
      totalRooms: 2,
    });
    tinyInnId = await adminPost('/api/hotels', {
      destinationId: kigaliId,
      name: 'Tiny Inn',
      address: 'KN 2 St',
      nightlyRate: 50,
      currency: 'USD',
      totalRooms: 1,
    });
    nairobiHotelId = await adminPost('/api/hotels', {
      destinationId: nairobiId,
      name: 'Nairobi Lodge',
      address: 'Moi Ave',
      nightlyRate: 80,
      currency: 'USD',
      totalRooms: 5,
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('drafting', () => {
    it('creates a draft and prices items into per-currency totals', async () => {
      aliceTrip = await createTrip(alice, 'Alice in Kigali');

      await api()
        .post(`/api/itineraries/${aliceTrip}/hotels`)
        .set(auth(alice))
        .send({
          hotelId,
          checkInDate: day(30),
          checkOutDate: day(33),
          rooms: 2,
        })
        .expect(201);
      const res = await api()
        .post(`/api/itineraries/${aliceTrip}/flights`)
        .set(auth(alice))
        .send({ flightId, passengers: 2 })
        .expect(201);

      expect(res.body.status).toBe('DRAFT');
      expect(res.body.itineraryHotel).toHaveLength(1);
      expect(res.body.itineraryFlight).toHaveLength(1);
      // 3 nights x 2 rooms x 100 + 2 passengers x 250
      expect(Number(res.body.totals.USD)).toBe(1100);
    });

    it('rejects invalid stays and trips', async () => {
      const add = (body: object) =>
        api()
          .post(`/api/itineraries/${aliceTrip}/hotels`)
          .set(auth(alice))
          .send(body);

      await add({
        hotelId,
        checkInDate: day(33),
        checkOutDate: day(33),
        rooms: 1,
      }).expect(400);
      await add({
        hotelId,
        checkInDate: day(34),
        checkOutDate: day(37),
        rooms: 1,
      }).expect(400);
      await add({
        hotelId: nairobiHotelId,
        checkInDate: day(30),
        checkOutDate: day(31),
        rooms: 1,
      }).expect(400);
      await add({
        hotelId,
        checkInDate: day(30),
        checkOutDate: day(31),
        rooms: 3,
      }).expect(409);
      await add({
        hotelId,
        checkInDate: day(30),
        checkOutDate: day(31),
        rooms: 1,
        extra: true,
      }).expect(400);

      await api()
        .post('/api/itineraries')
        .set(auth(alice))
        .send({
          name: 'Past trip',
          destinationId: kigaliId,
          startDate: day(-5),
          endDate: day(-1),
        })
        .expect(400);
      await api()
        .post('/api/itineraries')
        .set(auth(alice))
        .send({
          name: 'Backwards',
          destinationId: kigaliId,
          startDate: day(35),
          endDate: day(30),
        })
        .expect(400);
    });

    it('rejects date changes that would strand existing items', async () => {
      await api()
        .put(`/api/itineraries/${aliceTrip}`)
        .set(auth(alice))
        .send({ startDate: day(31) })
        .expect(400);
    });

    it('hides other users itineraries', async () => {
      await api()
        .get(`/api/itineraries/${aliceTrip}`)
        .set(auth(bob))
        .expect(404);
      await api()
        .delete(`/api/itineraries/${aliceTrip}`)
        .set(auth(bob))
        .expect(404);
      await api()
        .get(`/api/itineraries/${aliceTrip}`)
        .set(auth(admin))
        .expect(200);
    });
  });

  describe('confirming', () => {
    it('lets a second user draft the same inventory while nothing is confirmed', async () => {
      bobTrip = await createTrip(bob, 'Bob in Kigali');
      await api()
        .post(`/api/itineraries/${bobTrip}/hotels`)
        .set(auth(bob))
        .send({
          hotelId,
          checkInDate: day(32),
          checkOutDate: day(34),
          rooms: 1,
        })
        .expect(201);
      await api()
        .post(`/api/itineraries/${bobTrip}/flights`)
        .set(auth(bob))
        .send({ flightId, passengers: 2 })
        .expect(201);
    });

    it('confirms all items and takes the seats', async () => {
      const res = await api()
        .post(`/api/itineraries/${aliceTrip}/confirm`)
        .set(auth(alice))
        .expect(200);

      expect(res.body.status).toBe('PLANNED');
      expect(res.body.itineraryHotel[0].status).toBe('CONFIRMED');
      expect(res.body.itineraryFlight[0].status).toBe('CONFIRMED');
      expect(await seatsLeft()).toBe(1);
    });

    it('refuses to overbook a hotel', async () => {
      await api()
        .post(`/api/itineraries/${bobTrip}/confirm`)
        .set(auth(bob))
        .expect(409);
      await api()
        .post(`/api/itineraries/${bobTrip}/hotels`)
        .set(auth(bob))
        .send({
          hotelId,
          checkInDate: day(31),
          checkOutDate: day(32),
          rooms: 1,
        })
        .expect(409);
    });

    it('rolls back hotel stays when a flight is full', async () => {
      const trip = await api()
        .get(`/api/itineraries/${bobTrip}`)
        .set(auth(bob))
        .expect(200);
      // Swap the clashing stay for one starting on Alice's checkout day.
      await api()
        .delete(
          `/api/itineraries/${bobTrip}/hotels/${trip.body.itineraryHotel[0].id}`,
        )
        .set(auth(bob))
        .expect(200);
      await api()
        .post(`/api/itineraries/${bobTrip}/hotels`)
        .set(auth(bob))
        .send({
          hotelId,
          checkInDate: day(33),
          checkOutDate: day(35),
          rooms: 2,
        })
        .expect(201);

      await api()
        .post(`/api/itineraries/${bobTrip}/confirm`)
        .set(auth(bob))
        .expect(409);

      const after = await api()
        .get(`/api/itineraries/${bobTrip}`)
        .set(auth(bob))
        .expect(200);
      expect(after.body.status).toBe('DRAFT');
      expect(after.body.itineraryHotel[0].status).toBe('HELD');
      expect(await seatsLeft()).toBe(1);
    });

    it('locks a planned itinerary against edits', async () => {
      await api()
        .put(`/api/itineraries/${aliceTrip}`)
        .set(auth(alice))
        .send({ name: 'Renamed' })
        .expect(409);
      await api()
        .post(`/api/itineraries/${aliceTrip}/flights`)
        .set(auth(alice))
        .send({ flightId, passengers: 1 })
        .expect(409);
      await api()
        .delete(`/api/itineraries/${aliceTrip}`)
        .set(auth(alice))
        .expect(409);
    });
  });

  describe('cancelling', () => {
    it('releases seats and rooms', async () => {
      const res = await api()
        .post(`/api/itineraries/${aliceTrip}/cancel`)
        .set(auth(alice))
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.itineraryFlight[0].status).toBe('CANCELLED');
      expect(await seatsLeft()).toBe(3);

      await api()
        .post(`/api/itineraries/${bobTrip}/confirm`)
        .set(auth(bob))
        .expect(200);
      expect(await seatsLeft()).toBe(1);
    });

    it('only cancels planned itineraries', async () => {
      await api()
        .post(`/api/itineraries/${aliceTrip}/cancel`)
        .set(auth(alice))
        .expect(409);
    });

    it('lets cancelled itineraries be deleted', async () => {
      await api()
        .delete(`/api/itineraries/${aliceTrip}`)
        .set(auth(alice))
        .expect(200);
      await api()
        .get(`/api/itineraries/${aliceTrip}`)
        .set(auth(alice))
        .expect(404);
    });
  });

  describe('listing', () => {
    it("lists only the caller's itineraries, filterable by status", async () => {
      await createTrip(bob, 'Bob draft');

      const all = await api()
        .get('/api/itineraries')
        .set(auth(bob))
        .expect(200);
      expect(all.body.itineraries).toHaveLength(2);
      expect(all.body.pagination).toEqual({
        page: 1,
        skip: 0,
        limit: 15,
        total: 2,
        totalPages: 1,
      });

      const planned = await api()
        .get('/api/itineraries?status=PLANNED')
        .set(auth(bob))
        .expect(200);
      expect(planned.body.itineraries).toHaveLength(1);
      expect(planned.body.itineraries[0].id).toBe(bobTrip);

      const alices = await api()
        .get('/api/itineraries')
        .set(auth(alice))
        .expect(200);
      expect(alices.body.itineraries).toHaveLength(0);
    });
  });

  describe('concurrency', () => {
    it('confirms exactly one of two simultaneous bookings for the last room', async () => {
      const carol = await signUp('carol@trek.test');
      const dave = await signUp('dave@trek.test');
      const trips = await Promise.all([createTrip(carol), createTrip(dave)]);
      const tokens = [carol, dave];

      for (const [i, trip] of trips.entries()) {
        await api()
          .post(`/api/itineraries/${trip}/hotels`)
          .set(auth(tokens[i]))
          .send({
            hotelId: tinyInnId,
            checkInDate: day(31),
            checkOutDate: day(33),
            rooms: 1,
          })
          .expect(201);
      }

      const results = await Promise.all(
        trips.map((trip, i) =>
          api().post(`/api/itineraries/${trip}/confirm`).set(auth(tokens[i])),
        ),
      );

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const confirmed = await ctx.prisma.itineraryHotel.count({
        where: { hotelId: tinyInnId, status: 'CONFIRMED' },
      });
      expect(confirmed).toBe(1);
    });
  });
});
