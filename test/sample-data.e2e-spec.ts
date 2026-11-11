// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { seedCatalogue } from '../src/scripts/catalogue-seed';
import { DESTINATIONS } from '../src/scripts/sample-catalogue';
import { auth, createTestApp, day } from './utils';

describe('Sample catalogue (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let user: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await ctx.signUp('ada@trek.test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('adds every destination, airport and hotel, plus a flight schedule', async () => {
    const added = await seedCatalogue(ctx.prisma, { days: 7 });

    expect(added).toMatchObject({
      destinations: DESTINATIONS.length,
      airports: DESTINATIONS.length,
      hotels: DESTINATIONS.reduce((n, d) => n + d.hotels.length, 0),
    });
    expect(added.flights).toBeGreaterThan(300);
  });

  it('adds nothing twice when run again', async () => {
    await expect(seedCatalogue(ctx.prisma, { days: 7 })).resolves.toEqual({
      destinations: 0,
      airports: 0,
      hotels: 0,
      flights: 0,
    });
  });

  it('tops up the schedule when run with a longer window', async () => {
    const added = await seedCatalogue(ctx.prisma, { days: 10 });

    expect(added).toMatchObject({ destinations: 0, airports: 0, hotels: 0 });
    expect(added.flights).toBeGreaterThan(0);
  });

  it('can be searched the way the agent will', async () => {
    const flights = await ctx
      .api()
      .get(`/api/flights?from=KGL&to=NBO&date=${day(2)}`)
      .set(auth(user))
      .expect(200);
    expect(flights.body.data.length).toBeGreaterThanOrEqual(2);

    const paris = await ctx
      .api()
      .get('/api/destinations?name=Paris')
      .set(auth(user))
      .expect(200);
    const parisId = paris.body.data[0].id as string;
    const hotels = await ctx
      .api()
      .get(
        `/api/hotels?destinationId=${parisId}&checkIn=${day(3)}&checkOut=${day(5)}&rooms=1`,
      )
      .set(auth(user))
      .expect(200);
    expect(hotels.body.data).toHaveLength(3);
  });
});
