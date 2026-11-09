// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { auth, createTestApp, day, hasCode } from './utils';

type Event = {
  type: string;
  actorId: string | null;
  actorRole: string;
  details: Record<string, unknown> | null;
};

describe('Itinerary activity log (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let alice: string;
  let bob: string;
  let adminId: string;
  let aliceId: string;

  let kigaliId: string;
  let hotelId: string;
  let flightId: string;
  let tripId: string;

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
  const events = async (token: string, trip: string, query = '') =>
    (await as(token).get(`/api/itineraries/${trip}/events${query}`).expect(200))
      .body as { data: Event[]; pagination: { total: number } };
  const newTrip = async (token: string) =>
    (
      await as(token)
        .post('/api/itineraries', {
          name: 'Gorillas',
          destinationId: kigaliId,
          startDate: day(30),
          endDate: day(35),
        })
        .expect(201)
    ).body.data.id as string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.signUp('admin@trek.test', 'ADMIN');
    alice = await ctx.signUp('alice@trek.test');
    bob = await ctx.signUp('bob@trek.test');
    adminId = await meId(admin);
    aliceId = await meId(alice);

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
    const nboId = await create('/api/airports', {
      destinationId: nairobiId,
      code: 'NBO',
      name: 'Jomo Kenyatta International',
    });
    const kglId = await create('/api/airports', {
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
      totalRooms: 5,
    });
    flightId = await create('/api/flights', {
      departureAirportId: nboId,
      arrivalAirportId: kglId,
      airline: 'RwandAir',
      flightNumber: 'WB101',
      departureAt: `${day(30)}T08:00:00Z`,
      arrivalAt: `${day(30)}T10:00:00Z`,
      price: 250,
      currency: 'USD',
      totalSeats: 10,
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('records the whole life of a trip, newest first', async () => {
    tripId = await newTrip(alice);
    await as(alice)
      .put(`/api/itineraries/${tripId}`, { name: 'Gorillas & lakes' })
      .expect(200);
    // Saving without changes isn't an event.
    await as(alice)
      .put(`/api/itineraries/${tripId}`, { name: 'Gorillas & lakes' })
      .expect(200);
    const withHotel = await as(alice)
      .post(`/api/itineraries/${tripId}/hotels`, {
        hotelId,
        checkInDate: day(30),
        checkOutDate: day(32),
        rooms: 1,
      })
      .expect(201);
    const stayId = withHotel.body.data.itineraryHotel[0].id as string;
    await as(alice)
      .post(`/api/itineraries/${tripId}/hotels`, {
        hotelId,
        checkInDate: day(32),
        checkOutDate: day(35),
        rooms: 2,
      })
      .expect(201);
    await as(alice)
      .delete(`/api/itineraries/${tripId}/hotels/${stayId}`)
      .expect(200);
    await as(alice)
      .post(`/api/itineraries/${tripId}/flights`, { flightId, passengers: 2 })
      .expect(201);
    await as(alice).post(`/api/itineraries/${tripId}/confirm`).expect(200);
    await as(alice).post(`/api/itineraries/${tripId}/cancel`).expect(200);

    const { data, pagination } = await events(alice, tripId);

    expect(data.map((e) => e.type)).toEqual([
      'CANCELLED',
      'CONFIRMED',
      'FLIGHT_ADDED',
      'HOTEL_REMOVED',
      'HOTEL_ADDED',
      'HOTEL_ADDED',
      'UPDATED',
      'CREATED',
    ]);
    expect(pagination.total).toBe(8);
    for (const event of data)
      expect(event).toMatchObject({ actorId: aliceId, actorRole: 'USER' });

    const [cancelled, confirmed, flight, removed, , , updated, created] = data;
    expect(created.details).toEqual({
      name: 'Gorillas',
      destinationId: kigaliId,
      startDate: day(30),
      endDate: day(35),
    });
    expect(updated.details).toEqual({
      changes: { name: { from: 'Gorillas', to: 'Gorillas & lakes' } },
    });
    expect(removed.details).toMatchObject({
      itemId: stayId,
      hotelName: 'Hill View',
      checkInDate: day(30),
      checkOutDate: day(32),
      rooms: 1,
      totalPrice: '200.00',
    });
    expect(flight.details).toMatchObject({
      flightNumber: 'WB101',
      passengers: 2,
      totalPrice: '500.00',
      currency: 'USD',
    });
    // 3 nights x 2 rooms x 100, plus 2 x 250.
    expect(confirmed.details).toEqual({
      hotelStays: 1,
      flights: 1,
      totals: { USD: '1100.00' },
    });
    expect(cancelled.details).toEqual({
      hotelStays: 1,
      flights: 1,
      releasedSeats: 2,
    });
  });

  it('pages and filters by type', async () => {
    const page = await events(alice, tripId, '?limit=3&page=2');
    expect(page.data.map((e) => e.type)).toEqual([
      'HOTEL_REMOVED',
      'HOTEL_ADDED',
      'HOTEL_ADDED',
    ]);

    const added = await events(alice, tripId, '?type=HOTEL_ADDED');
    expect(added.data).toHaveLength(2);
    expect(added.pagination.total).toBe(2);

    await as(alice)
      .get(`/api/itineraries/${tripId}/events?type=EXPLODED`)
      .expect(400)
      .expect(hasCode('VALIDATION_FAILED'));
  });

  it("hides other users' history", async () => {
    await as(bob)
      .get(`/api/itineraries/${tripId}/events`)
      .expect(404)
      .expect(hasCode('NOT_FOUND'));
  });

  it('does not record actions that failed', async () => {
    const trip = await newTrip(alice);
    await as(alice).post(`/api/itineraries/${trip}/confirm`).expect(400);
    await as(alice)
      .post(`/api/itineraries/${trip}/hotels`, {
        hotelId,
        checkInDate: day(30),
        checkOutDate: day(32),
        rooms: 99,
      })
      .expect(409);

    const { data } = await events(alice, trip);
    expect(data.map((e) => e.type)).toEqual(['CREATED']);
  });

  it('shows when an admin acted, even after the admin account is gone', async () => {
    const trip = await newTrip(alice);
    await as(admin)
      .post(`/api/itineraries/${trip}/flights`, { flightId, passengers: 1 })
      .expect(201);

    const [byAdmin] = (await events(alice, trip)).data;
    expect(byAdmin).toMatchObject({
      type: 'FLIGHT_ADDED',
      actorId: adminId,
      actorRole: 'ADMIN',
    });

    await as(admin).delete(`/api/users/${adminId}`).expect(200);

    const [after] = (await events(alice, trip)).data;
    expect(after).toMatchObject({
      type: 'FLIGHT_ADDED',
      actorId: null,
      actorRole: 'ADMIN',
    });
  });

  it("goes away with the itinerary and with the owner's account", async () => {
    await as(alice).delete(`/api/itineraries/${tripId}`).expect(200);
    expect(
      await ctx.prisma.itineraryEvent.count({ where: { itineraryId: tripId } }),
    ).toBe(0);

    await as(alice).delete(`/api/users/${aliceId}`).expect(200);
    expect(await ctx.prisma.itineraryEvent.count()).toBe(0);
  });
});
