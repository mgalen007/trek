// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { randomUUID } from 'crypto';
import { SchedulerRegistry } from '@nestjs/schedule';
import { MaintenanceService } from '../src/jobs/maintenance.service';
import { auth, createTestApp, day } from './utils';

const HOUR_MS = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);
const utcDay = (offset: number) => new Date(`${day(offset)}T00:00:00Z`);

describe('Scheduled jobs (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let jobs: MaintenanceService;
  let user: string;
  let userId: string;
  let kigaliId: string;
  let hotelId: string;

  const api = () => ctx.api();
  const as = (token: string) => ({
    get: (path: string) => api().get(path).set(auth(token)),
    post: (path: string, body: object = {}) =>
      api().post(path).set(auth(token)).send(body),
  });

  // A confirmed trip, then moved to the given days (relative to today)
  // directly in the database: the API won't create trips in the past.
  const plannedTrip = async (startOffset: number, endOffset: number) => {
    const trip = (
      await as(user)
        .post('/api/itineraries', {
          name: 'Trip',
          destinationId: kigaliId,
          startDate: day(30),
          endDate: day(32),
        })
        .expect(201)
    ).body.data.id as string;
    await as(user)
      .post(`/api/itineraries/${trip}/hotels`, {
        hotelId,
        checkInDate: day(30),
        checkOutDate: day(32),
        rooms: 1,
      })
      .expect(201);
    await as(user).post(`/api/itineraries/${trip}/confirm`).expect(200);
    await ctx.prisma.itinerary.update({
      where: { id: trip },
      data: { startDate: utcDay(startOffset), endDate: utcDay(endOffset) },
    });
    return trip;
  };
  const status = async (trip: string) =>
    (await as(user).get(`/api/itineraries/${trip}`).expect(200)).body.data
      .status as string;

  beforeAll(async () => {
    ctx = await createTestApp();
    jobs = ctx.app.get(MaintenanceService);
    const admin = await ctx.signUp('admin@trek.test', 'ADMIN');
    user = await ctx.signUp('user@trek.test');
    userId = (await as(user).get('/api/auth/me').expect(200)).body.data
      .id as string;

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
          totalRooms: 10,
        })
        .expect(201)
    ).body.data.id as string;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('registers every job on the schedule', () => {
    const names = [...ctx.app.get(SchedulerRegistry).getCronJobs().keys()];

    expect(names.sort()).toEqual([
      'complete-past-itineraries',
      'purge-emails',
      'purge-idempotency-keys',
      'purge-refresh-tokens',
      'send-emails',
    ]);
  });

  it('purges idempotency keys older than 24 hours', async () => {
    const key = (createdAt: Date, completed = true) => ({
      userId,
      key: randomUUID(),
      method: 'POST',
      path: '/api/itineraries',
      requestHash: 'hash',
      createdAt,
      completedAt: completed ? createdAt : null,
    });
    await ctx.prisma.idempotencyKey.createMany({
      data: [
        key(ago(25 * HOUR_MS)),
        key(ago(25 * HOUR_MS), false),
        key(ago(HOUR_MS)),
      ],
    });

    await expect(jobs.purgeIdempotencyKeys()).resolves.toBe(2);
    expect(await ctx.prisma.idempotencyKey.count()).toBe(1);
  });

  it('purges expired refresh tokens and ones revoked over a day ago', async () => {
    await ctx.prisma.refreshToken.deleteMany();
    const token = (fields: { expiresAt: Date; revokedAt?: Date }) => ({
      userId,
      familyId: randomUUID(),
      tokenHash: randomUUID(),
      ...fields,
    });
    const future = new Date(Date.now() + 24 * HOUR_MS);
    await ctx.prisma.refreshToken.createMany({
      data: [
        token({ expiresAt: ago(HOUR_MS) }),
        token({ expiresAt: future, revokedAt: ago(25 * HOUR_MS) }),
        token({ expiresAt: future, revokedAt: ago(HOUR_MS) }),
        token({ expiresAt: future }),
      ],
    });

    await expect(jobs.purgeRefreshTokens()).resolves.toBe(2);
    expect(await ctx.prisma.refreshToken.count()).toBe(2);
  });

  it('completes planned trips that have ended, once, as the system', async () => {
    const ended = await plannedTrip(-5, -1);
    const endsToday = await plannedTrip(-3, 0);
    const draft = (
      await as(user)
        .post('/api/itineraries', {
          name: 'Never confirmed',
          destinationId: kigaliId,
          startDate: day(30),
          endDate: day(32),
        })
        .expect(201)
    ).body.data.id as string;
    await ctx.prisma.itinerary.update({
      where: { id: draft },
      data: { startDate: utcDay(-5), endDate: utcDay(-1) },
    });

    await expect(jobs.completePastItineraries()).resolves.toBe(1);

    expect(await status(ended)).toBe('COMPLETED');
    expect(await status(endsToday)).toBe('PLANNED');
    expect(await status(draft)).toBe('DRAFT');

    const [event] = (
      await as(user).get(`/api/itineraries/${ended}/events`).expect(200)
    ).body.data as object[];
    expect(event).toMatchObject({
      type: 'COMPLETED',
      actorId: null,
      actorRole: null,
      details: { endDate: day(-1) },
    });

    // Running again changes nothing and logs nothing new.
    await expect(jobs.completePastItineraries()).resolves.toBe(0);
    const completedEvents = await ctx.prisma.itineraryEvent.count({
      where: { itineraryId: ended, type: 'COMPLETED' },
    });
    expect(completedEvents).toBe(1);
  });

  it('leaves completed trips out of reach of cancel', async () => {
    const trip = await plannedTrip(-4, -2);
    await jobs.completePastItineraries();

    await as(user).post(`/api/itineraries/${trip}/cancel`).expect(409);
  });
});
