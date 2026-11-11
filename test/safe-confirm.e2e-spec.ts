// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { auth, createTestApp, day, hasCode } from './utils';

type Quote = {
  version: number;
  status: string;
  bookable: boolean;
  totals: Record<string, string>;
  hotelStays: { itemId: string; totalPrice: string; priceChanged: boolean }[];
  flights: { totalPrice: string; priceChanged: boolean }[];
  issues: { code: string; itemId?: string }[];
};

describe('Safe confirm: quote, version and expected totals (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let user: string;
  let other: string;
  let agent: string;
  let kigaliId: string;
  let hotelId: string;
  let flightId: string;

  const api = () => ctx.api();
  const as = (token: string) => ({
    get: (path: string) => api().get(path).set(auth(token)),
    post: (path: string, body: object = {}) =>
      api().post(path).set(auth(token)).send(body),
    put: (path: string, body: object) =>
      api().put(path).set(auth(token)).send(body),
  });
  const quote = async (token: string, trip: string) =>
    (await as(token).get(`/api/itineraries/${trip}/quote`).expect(200)).body
      .data as Quote;
  const confirm = (token: string, trip: string, body: object) =>
    as(token).post(`/api/itineraries/${trip}/confirm`, body);
  const status = async (trip: string) =>
    (await as(user).get(`/api/itineraries/${trip}`).expect(200)).body.data
      .status as string;
  // 3 nights x 1 room x 100 USD, plus 1 seat x 250 USD.
  const draft = async (token = user, rooms = 1, hotel = hotelId) => {
    const trip = (
      await as(token)
        .post('/api/itineraries', {
          name: 'Kigali',
          destinationId: kigaliId,
          startDate: day(30),
          endDate: day(33),
        })
        .expect(201)
    ).body.data.id as string;
    await as(token)
      .post(`/api/itineraries/${trip}/hotels`, {
        hotelId: hotel,
        checkInDate: day(30),
        checkOutDate: day(33),
        rooms,
      })
      .expect(201);
    await as(token)
      .post(`/api/itineraries/${trip}/flights`, { flightId, passengers: 1 })
      .expect(201);
    return trip;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.signUp('admin@trek.test', 'ADMIN');
    user = await ctx.signUp('ada@trek.test');
    other = await ctx.signUp('bob@trek.test');
    agent = (await as(user).post('/api/auth/agent-token').expect(200)).body.data
      .accessToken as string;

    const create = async (path: string, body: object) =>
      (await as(admin).post(path, body).expect(201)).body.data.id as string;
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
    const nbo = await create('/api/airports', {
      destinationId: nairobiId,
      code: 'NBO',
      name: 'Jomo Kenyatta International',
    });
    const kgl = await create('/api/airports', {
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
      totalRooms: 20,
    });
    flightId = await create('/api/flights', {
      departureAirportId: nbo,
      arrivalAirportId: kgl,
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

  it('quotes every item at current prices, with the version to confirm', async () => {
    const trip = await draft();

    const q = await quote(user, trip);
    expect(q).toMatchObject({
      status: 'DRAFT',
      version: 3,
      bookable: true,
      totals: { USD: '550.00' },
      issues: [],
    });
    expect(q.hotelStays[0]).toMatchObject({
      totalPrice: '300.00',
      priceChanged: false,
    });
    expect(q.flights[0]).toMatchObject({
      totalPrice: '250.00',
      priceChanged: false,
    });

    // The agent can quote too, to tell the user what confirming would cost.
    expect((await quote(agent, trip)).totals).toEqual({ USD: '550.00' });
  });

  it('counts every change in the version, but not saves without changes', async () => {
    const trip = await draft();
    const v = (await quote(user, trip)).version;

    await as(user)
      .put(`/api/itineraries/${trip}`, { name: 'Renamed' })
      .expect(200);
    expect((await quote(user, trip)).version).toBe(v + 1);

    await as(user)
      .put(`/api/itineraries/${trip}`, { name: 'Renamed' })
      .expect(200);
    expect((await quote(user, trip)).version).toBe(v + 1);
  });

  it('confirms exactly what was reviewed', async () => {
    const trip = await draft();
    const q = await quote(user, trip);

    const res = await confirm(user, trip, {
      expectedVersion: q.version,
      expectedTotals: q.totals,
    }).expect(200);

    expect(res.body.data).toMatchObject({
      status: 'PLANNED',
      totals: { USD: '550' },
    });
    expect(res.body.data.version).toBe(q.version + 1);
  });

  it('refuses a trip that changed after review, e.g. by the agent', async () => {
    const trip = await draft();
    const reviewed = await quote(user, trip);

    // The assistant keeps working on the draft while the user reviews it.
    await as(agent)
      .put(`/api/itineraries/${trip}`, { name: 'Changed by the assistant' })
      .expect(200);

    const res = await confirm(user, trip, {
      expectedVersion: reviewed.version,
      expectedTotals: reviewed.totals,
    })
      .expect(409)
      .expect(hasCode('ITINERARY_CHANGED'));
    expect(res.body.error.details).toEqual({
      expectedVersion: reviewed.version,
      currentVersion: reviewed.version + 1,
    });
    expect(await status(trip)).toBe('DRAFT');
  });

  it('refuses a total that no longer matches current prices', async () => {
    const trip = await draft();
    const reviewed = await quote(user, trip);
    const flightSeats = async () =>
      (await as(user).get(`/api/flights/${flightId}`).expect(200)).body.data
        .availableSeats as number;
    const seats = await flightSeats();

    await as(admin)
      .put(`/api/hotels/${hotelId}`, { nightlyRate: 120 })
      .expect(200);

    const res = await confirm(user, trip, {
      expectedVersion: reviewed.version,
      expectedTotals: reviewed.totals,
    })
      .expect(409)
      .expect(hasCode('PRICE_CHANGED'));
    expect(res.body.error.details).toEqual({
      expectedTotals: { USD: '550.00' },
      currentTotals: { USD: '610.00' },
    });
    // Nothing was reserved.
    expect(await flightSeats()).toBe(seats);
    expect(await status(trip)).toBe('DRAFT');

    // A fresh quote shows the change, and confirming at the new price works.
    const again = await quote(user, trip);
    expect(again.hotelStays[0]).toMatchObject({
      totalPrice: '360.00',
      priceChanged: true,
    });
    await confirm(user, trip, {
      expectedVersion: again.version,
      expectedTotals: again.totals,
    }).expect(200);

    await as(admin)
      .put(`/api/hotels/${hotelId}`, { nightlyRate: 100 })
      .expect(200);
  });

  it('compares amounts as numbers and needs every currency', async () => {
    const trip = await draft();
    const { version } = await quote(user, trip);

    await confirm(user, trip, {
      expectedVersion: version,
      expectedTotals: { USD: '550.00', EUR: '0.00' },
    })
      .expect(409)
      .expect(hasCode('PRICE_CHANGED'));
    await confirm(user, trip, {
      expectedVersion: version,
      expectedTotals: { USD: '550' },
    }).expect(200);
  });

  it('requires the reviewed version and totals', async () => {
    const trip = await draft();

    await confirm(user, trip, {})
      .expect(400)
      .expect(hasCode('VALIDATION_FAILED'));
    await confirm(user, trip, {
      expectedVersion: 1,
      expectedTotals: { usd: 'lots' },
    })
      .expect(400)
      .expect(hasCode('VALIDATION_FAILED'));
    expect(await status(trip)).toBe('DRAFT');
  });

  it('lists what would make confirm fail, without failing itself', async () => {
    const tiny = (
      await as(admin)
        .post('/api/hotels', {
          destinationId: kigaliId,
          name: 'Tiny Inn',
          address: 'KN 2 St',
          nightlyRate: 80,
          currency: 'USD',
          totalRooms: 1,
        })
        .expect(201)
    ).body.data.id as string;
    // Both drafts take the only room; Bob confirms first.
    const mine = await draft(user, 1, tiny);
    const bobs = await draft(other, 1, tiny);
    const bobQuote = await quote(other, bobs);
    await confirm(other, bobs, {
      expectedVersion: bobQuote.version,
      expectedTotals: bobQuote.totals,
    }).expect(200);

    const q = await quote(user, mine);
    expect(q.bookable).toBe(false);
    const tinyStay = q.hotelStays.find((s) => s.totalPrice === '240.00');
    expect(q.issues).toEqual([
      expect.objectContaining({
        code: 'ROOMS_UNAVAILABLE',
        itemId: tinyStay?.itemId,
      }),
    ]);

    const planned = await quote(other, bobs);
    expect(planned).toMatchObject({ status: 'PLANNED', bookable: false });
    expect(planned.issues).toEqual([
      expect.objectContaining({ code: 'INVALID_STATUS' }),
    ]);
  });

  it("other users' trips can't be quoted", async () => {
    const trip = await draft();
    await as(other).get(`/api/itineraries/${trip}/quote`).expect(404);
  });
});
