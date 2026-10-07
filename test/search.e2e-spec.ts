// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { randomUUID } from 'crypto';
import { auth, createTestApp, day } from './utils';

describe('Search & discovery (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let user: string;

  let kigaliId: string;
  let nairobiId: string;
  let hillViewId: string;
  let pastFlightId: string;

  const get = (path: string, token = user) =>
    ctx.api().get(path).set(auth(token));

  const adminPost = async (path: string, body: object) => {
    const res = await ctx
      .api()
      .post(path)
      .set(auth(admin))
      .send(body)
      .expect(201);
    return res.body.data.id as string;
  };

  const names = (res: { body: { data: { name: string }[] } }) =>
    res.body.data.map((h) => h.name);
  const flightNumbers = (res: { body: { data: { flightNumber: string }[] } }) =>
    res.body.data.map((f) => f.flightNumber);

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.signUp('admin@trek.test', 'ADMIN');
    user = await ctx.signUp('user@trek.test');

    kigaliId = await adminPost('/api/destinations', {
      name: 'Kigali',
      city: 'Kigali',
      country: 'Rwanda',
    });
    await adminPost('/api/destinations', {
      name: 'Volcanoes',
      city: 'Musanze',
      country: 'Rwanda',
    });
    nairobiId = await adminPost('/api/destinations', {
      name: 'Nairobi',
      city: 'Nairobi',
      country: 'Kenya',
    });

    const hotel = (
      destinationId: string,
      name: string,
      nightlyRate: number,
      totalRooms: number,
      rating?: number,
      currency = 'USD',
    ) =>
      adminPost('/api/hotels', {
        destinationId,
        name,
        address: `${name} Road`,
        nightlyRate,
        currency,
        totalRooms,
        rating,
      });
    await hotel(kigaliId, 'Budget Inn', 40, 1, 3);
    await hotel(kigaliId, 'Euro Stay', 90, 2, 3.5, 'EUR');
    hillViewId = await hotel(kigaliId, 'Hill View', 100, 2, 4.5);
    await hotel(kigaliId, 'Serena', 250, 10, 5);
    await hotel(kigaliId, 'Unrated Lodge', 70, 3);
    await hotel(nairobiId, 'Nairobi Lodge', 80, 5, 4);

    const kgl = await adminPost('/api/airports', {
      destinationId: kigaliId,
      code: 'KGL',
      name: 'Kigali International',
    });
    const nbo = await adminPost('/api/airports', {
      destinationId: nairobiId,
      code: 'NBO',
      name: 'Jomo Kenyatta International',
    });
    const wil = await adminPost('/api/airports', {
      destinationId: nairobiId,
      code: 'WIL',
      name: 'Wilson Airport',
    });

    const flight = (
      flightNumber: string,
      from: string,
      to: string,
      departureAt: string,
      price: number,
      availableSeats: number,
    ) =>
      adminPost('/api/flights', {
        departureAirportId: from,
        arrivalAirportId: to,
        airline: 'TestAir',
        flightNumber,
        departureAt,
        arrivalAt: new Date(
          new Date(departureAt).getTime() + 2 * 3600_000,
        ).toISOString(),
        price,
        currency: 'USD',
        availableSeats,
      });
    await flight('WB101', nbo, kgl, `${day(30)}T08:00:00Z`, 250, 3);
    await flight('KQ200', nbo, kgl, `${day(30)}T18:00:00Z`, 180, 1);
    await flight('WB103', wil, kgl, `${day(31)}T09:00:00Z`, 120, 50);
    await flight('WB900', kgl, nbo, `${day(40)}T07:00:00Z`, 200, 10);
    pastFlightId = await flight(
      'OLD1',
      nbo,
      kgl,
      `${day(-1)}T08:00:00Z`,
      99,
      5,
    );

    // Fill Hill View (2 rooms) for the nights of day 30, 31 and 32.
    const trip = await ctx
      .api()
      .post('/api/itineraries')
      .set(auth(user))
      .send({
        name: 'Booked',
        destinationId: kigaliId,
        startDate: day(30),
        endDate: day(35),
      })
      .expect(201);
    await ctx
      .api()
      .post(`/api/itineraries/${trip.body.data.id}/hotels`)
      .set(auth(user))
      .send({
        hotelId: hillViewId,
        checkInDate: day(30),
        checkOutDate: day(33),
        rooms: 2,
      })
      .expect(201);
    await ctx
      .api()
      .post(`/api/itineraries/${trip.body.data.id}/confirm`)
      .set(auth(user))
      .expect(200);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('GET /hotels', () => {
    it('filters by destination, sorted by name by default', async () => {
      const res = await get(`/api/hotels?destinationId=${kigaliId}`).expect(
        200,
      );

      expect(names(res)).toEqual([
        'Budget Inn',
        'Euro Stay',
        'Hill View',
        'Serena',
        'Unrated Lodge',
      ]);
      expect(res.body.data[0].destination.name).toBe('Kigali');
      expect(res.body.pagination).toMatchObject({ total: 5, totalPages: 1 });
    });

    it('filters by price range and currency', async () => {
      const res = await get(
        '/api/hotels?minPrice=50&maxPrice=150&currency=usd&sort=price',
      ).expect(200);

      expect(names(res)).toEqual([
        'Unrated Lodge',
        'Nairobi Lodge',
        'Hill View',
      ]);
    });

    it('filters by minimum rating and sorts by rating', async () => {
      const res = await get('/api/hotels?minRating=4&sort=rating&order=desc');

      expect(names(res)).toEqual(['Serena', 'Hill View', 'Nairobi Lodge']);
    });

    it('puts unrated hotels last when sorting by rating', async () => {
      const res = await get(
        `/api/hotels?destinationId=${kigaliId}&sort=rating`,
      );

      expect(names(res)).toEqual([
        'Budget Inn',
        'Euro Stay',
        'Hill View',
        'Serena',
        'Unrated Lodge',
      ]);
    });

    it('pages with total and totalPages', async () => {
      const res = await get(
        `/api/hotels?destinationId=${kigaliId}&limit=2&page=3`,
      ).expect(200);

      expect(names(res)).toEqual(['Unrated Lodge']);
      expect(res.body.pagination).toEqual({
        page: 3,
        skip: 4,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
    });

    it('excludes hotels without free rooms for the dates', async () => {
      const res = await get(
        `/api/hotels?destinationId=${kigaliId}&checkIn=${day(31)}&checkOut=${day(32)}`,
      ).expect(200);

      expect(names(res)).not.toContain('Hill View');
      expect(res.body.pagination.total).toBe(4);
      const budget = res.body.data.find(
        (h: { name: string }) => h.name === 'Budget Inn',
      );
      expect(budget.availableRooms).toBe(1);
    });

    it('requires enough free rooms when rooms is given', async () => {
      const res = await get(
        `/api/hotels?destinationId=${kigaliId}&checkIn=${day(31)}&checkOut=${day(32)}&rooms=2&limit=2`,
      ).expect(200);

      expect(names(res)).toEqual(['Euro Stay', 'Serena']);
      expect(res.body.pagination).toMatchObject({ total: 3, totalPages: 2 });
    });

    it('shows a hotel again once its bookings end', async () => {
      const res = await get(
        `/api/hotels?destinationId=${kigaliId}&checkIn=${day(33)}&checkOut=${day(35)}&rooms=2`,
      ).expect(200);

      const hillView = res.body.data.find(
        (h: { id: string }) => h.id === hillViewId,
      );
      expect(hillView.availableRooms).toBe(2);
    });

    it.each([
      ['only one of checkIn/checkOut', `checkIn=${day(31)}`],
      ['checkOut before checkIn', `checkIn=${day(32)}&checkOut=${day(31)}`],
      ['checkIn in the past', `checkIn=${day(-2)}&checkOut=${day(1)}`],
      ['minPrice above maxPrice', 'minPrice=200&maxPrice=100'],
      ['limit above 100', 'limit=101'],
      ['an unknown sort field', 'sort=stars'],
    ])('rejects %s', async (_case, qs) => {
      await get(`/api/hotels?${qs}`).expect(400);
    });
  });

  describe('GET /flights', () => {
    it('only lists upcoming flights, soonest first, with airports', async () => {
      const res = await get('/api/flights').expect(200);

      expect(flightNumbers(res)).toEqual(['WB101', 'KQ200', 'WB103', 'WB900']);
      expect(res.body.data[0].departureAirport.code).toBe('NBO');
      expect(res.body.data[0].arrivalAirport.code).toBe('KGL');
      expect(res.body.pagination.total).toBe(4);
    });

    it('still serves past flights by id', async () => {
      await get(`/api/flights/${pastFlightId}`).expect(200);
    });

    it('filters by airport codes, case-insensitively', async () => {
      const res = await get('/api/flights?from=nbo&to=KGL').expect(200);

      expect(flightNumbers(res)).toEqual(['WB101', 'KQ200']);
    });

    it('filters by destination, covering every airport there', async () => {
      const res = await get(
        `/api/flights?fromDestinationId=${nairobiId}&toDestinationId=${kigaliId}`,
      ).expect(200);

      expect(flightNumbers(res)).toEqual(['WB101', 'KQ200', 'WB103']);
    });

    it('filters by departure day', async () => {
      const res = await get(`/api/flights?date=${day(31)}`).expect(200);

      expect(flightNumbers(res)).toEqual(['WB103']);
    });

    it('needs enough seats for all passengers', async () => {
      const res = await get('/api/flights?from=NBO&passengers=2').expect(200);

      expect(flightNumbers(res)).toEqual(['WB101']);
    });

    it('filters by max price and sorts by price', async () => {
      const res = await get('/api/flights?maxPrice=200&sort=price').expect(200);

      expect(flightNumbers(res)).toEqual(['WB103', 'KQ200', 'WB900']);
    });
  });

  describe('destinations', () => {
    it('searches name, city and country with q', async () => {
      const byCountry = await get('/api/destinations?q=rwanda').expect(200);
      expect(byCountry.body.data.map((d: { name: string }) => d.name)).toEqual([
        'Kigali',
        'Volcanoes',
      ]);

      const byCity = await get('/api/destinations?q=musan').expect(200);
      expect(byCity.body.data.map((d: { name: string }) => d.name)).toEqual([
        'Volcanoes',
      ]);
    });

    it('filters by exact country', async () => {
      const res = await get('/api/destinations?country=kenya').expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toMatchObject({ total: 1, totalPages: 1 });
    });

    it('lists a destination’s hotels with the hotel filters', async () => {
      const res = await get(
        `/api/destinations/${kigaliId}/hotels?sort=price&destinationId=${nairobiId}`,
      ).expect(200);

      // The path's destination wins over a destinationId in the query.
      expect(names(res)).toEqual([
        'Budget Inn',
        'Unrated Lodge',
        'Euro Stay',
        'Hill View',
        'Serena',
      ]);
    });

    it('lists a destination’s airports', async () => {
      const res = await get(`/api/destinations/${nairobiId}/airports`).expect(
        200,
      );

      expect(res.body.data.map((a: { code: string }) => a.code)).toEqual([
        'NBO',
        'WIL',
      ]);
    });

    it('404s for unknown destinations and 400s for bad ids', async () => {
      await get(`/api/destinations/${randomUUID()}/hotels`).expect(404);
      await get('/api/destinations/not-a-uuid/airports').expect(400);
    });
  });

  it('filters airports by code', async () => {
    const res = await get('/api/airports?code=kgl').expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].destinationId).toBe(kigaliId);
  });
});
