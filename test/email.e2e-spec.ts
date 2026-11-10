// supertest types response bodies as `any`; asserting on them is the point here.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { LogMailer, Mailer } from '../src/email/mailer';
import {
  EmailOutboxService,
  MAX_ATTEMPTS,
} from '../src/email/email-outbox.service';
import { MaintenanceService } from '../src/jobs/maintenance.service';
import { auth, createTestApp, day } from './utils';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Emails (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let outbox: EmailOutboxService;
  let mailer: LogMailer;
  let admin: string;
  let user: string;
  let userId: string;
  let kigaliId: string;
  let hotelId: string;

  const api = () => ctx.api();
  const as = (token: string) => ({
    get: (path: string) => api().get(path).set(auth(token)),
    post: (path: string, body: object = {}) =>
      api().post(path).set(auth(token)).send(body),
    delete: (path: string) => api().delete(path).set(auth(token)),
  });
  const queued = (template: string) =>
    ctx.prisma.emailOutbox.findMany({
      where: { template },
      orderBy: { createdAt: 'asc' },
    });
  const draft = async (token: string, name = 'Gorillas', rooms = 1) => {
    const trip = (
      await as(token)
        .post('/api/itineraries', {
          name,
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
        rooms,
      })
      .expect(201);
    return trip;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    outbox = ctx.app.get(EmailOutboxService);
    mailer = ctx.app.get<Mailer, LogMailer>(Mailer);
    admin = await ctx.signUp('admin@trek.test', 'ADMIN');
    user = await ctx.signUp('ada@trek.test');
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
          totalRooms: 3,
        })
        .expect(201)
    ).body.data.id as string;
  });

  beforeEach(() => {
    mailer.sent.length = 0;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('queues a welcome email on registration and delivers it', async () => {
    const [welcome] = (await queued('WELCOME')).filter(
      (email) => email.userId === userId,
    );
    expect(welcome).toMatchObject({
      to: 'ada@trek.test',
      subject: 'Welcome to Trek, Test',
      status: 'PENDING',
      attempts: 0,
    });

    // Both users' welcome emails.
    await expect(outbox.sendPending()).resolves.toBe(2);

    expect(mailer.sent.map((m) => m.to).sort()).toEqual([
      'ada@trek.test',
      'admin@trek.test',
    ]);
    const sent = await ctx.prisma.emailOutbox.findUniqueOrThrow({
      where: { id: welcome.id },
    });
    expect(sent).toMatchObject({ status: 'SENT', attempts: 1 });
    expect(sent.sentAt).toBeInstanceOf(Date);

    // Nothing left to send.
    await expect(outbox.sendPending()).resolves.toBe(0);
  });

  it('emails the owner a summary when a trip is confirmed', async () => {
    const trip = await draft(user, 'Gorillas <script>');
    await as(user).post(`/api/itineraries/${trip}/confirm`).expect(200);

    const [email] = await queued('ITINERARY_CONFIRMED');
    expect(email).toMatchObject({
      userId,
      to: 'ada@trek.test',
      subject: 'Booked: Gorillas <script>',
    });
    expect(email.text).toContain(
      `- Hill View: ${day(30)} to ${day(33)}, 1 room(s), 300.00 USD`,
    );
    expect(email.text).toContain('Total: 300.00 USD');
    expect(email.html).toContain('Gorillas &lt;script&gt;');
    expect(email.html).not.toContain('<script>');
  });

  it('emails the owner, not the admin, when an admin acts for them', async () => {
    const trip = await draft(user, 'Booked by support');
    await as(admin).post(`/api/itineraries/${trip}/confirm`).expect(200);

    const emails = await queued('ITINERARY_CONFIRMED');
    expect(emails.at(-1)).toMatchObject({
      to: 'ada@trek.test',
      subject: 'Booked: Booked by support',
    });
  });

  it('queues nothing when the change rolls back', async () => {
    const before = (await queued('ITINERARY_CONFIRMED')).length;
    // Two rooms already held by the trips above; 3 total.
    const trip = await draft(user, 'Too big', 1);
    await ctx.prisma.itineraryHotel.updateMany({
      where: { itineraryId: trip },
      data: { rooms: 3 },
    });

    await as(user).post(`/api/itineraries/${trip}/confirm`).expect(409);

    expect(await queued('ITINERARY_CONFIRMED')).toHaveLength(before);
  });

  it('emails when a trip is cancelled', async () => {
    const [booked] = await ctx.prisma.itinerary.findMany({
      where: { userId, status: 'PLANNED' },
    });
    await as(user).post(`/api/itineraries/${booked.id}/cancel`).expect(200);

    const [email] = await queued('ITINERARY_CANCELLED');
    expect(email).toMatchObject({
      to: 'ada@trek.test',
      subject: `Cancelled: ${booked.name}`,
    });
    expect(email.text).toContain('released');
  });

  it('emails when the scheduled job completes a trip', async () => {
    const [planned] = await ctx.prisma.itinerary.findMany({
      where: { userId, status: 'PLANNED' },
    });
    await ctx.prisma.itinerary.update({
      where: { id: planned.id },
      data: {
        startDate: new Date(`${day(-5)}T00:00:00Z`),
        endDate: new Date(`${day(-1)}T00:00:00Z`),
      },
    });

    await ctx.app.get(MaintenanceService).completePastItineraries();

    const [email] = await queued('ITINERARY_COMPLETED');
    expect(email).toMatchObject({
      to: 'ada@trek.test',
      subject: `Welcome back from ${planned.name}`,
    });
  });

  it('retries failed sends with backoff, then gives up', async () => {
    await outbox.sendPending(); // clear the queue
    const email = await ctx.prisma.emailOutbox.create({
      data: {
        userId,
        to: 'ada@trek.test',
        template: 'WELCOME',
        subject: 'Retry me',
        text: 'text',
        html: '<p>html</p>',
      },
    });
    const send = jest
      .spyOn(mailer, 'send')
      .mockRejectedValue(new Error('SMTP down'));
    const due = () =>
      ctx.prisma.emailOutbox.update({
        where: { id: email.id },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
    const row = () =>
      ctx.prisma.emailOutbox.findUniqueOrThrow({ where: { id: email.id } });

    await expect(outbox.sendPending()).resolves.toBe(0);
    const failedOnce = await row();
    expect(failedOnce).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: 'Error: SMTP down',
    });
    // Waits about a minute before the next try.
    expect(failedOnce.nextAttemptAt.getTime()).toBeGreaterThan(
      Date.now() + 50_000,
    );
    await outbox.sendPending();
    expect(send).toHaveBeenCalledTimes(1);

    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      await due();
      await outbox.sendPending();
    }
    expect(await row()).toMatchObject({
      status: 'FAILED',
      attempts: MAX_ATTEMPTS,
    });

    // A failed email is never tried again.
    await due();
    await outbox.sendPending();
    expect(send).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    send.mockRestore();
  });

  it('sends each email once even when senders run concurrently', async () => {
    await ctx.prisma.emailOutbox.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        userId,
        to: 'ada@trek.test',
        template: 'WELCOME',
        subject: `Concurrent ${i}`,
        text: 'text',
        html: '<p>html</p>',
      })),
    });

    const results = await Promise.all([
      outbox.sendPending(),
      outbox.sendPending(),
      outbox.sendPending(),
    ]);

    expect(results.reduce((a, b) => a + b, 0)).toBe(10);
    const subjects = mailer.sent
      .map((m) => m.subject)
      .filter((s) => s.startsWith('Concurrent'));
    expect(new Set(subjects).size).toBe(10);
    expect(subjects).toHaveLength(10);
  });

  it('purges delivered and failed emails after 30 days', async () => {
    const old = new Date(Date.now() - 31 * DAY_MS);
    await ctx.prisma.emailOutbox.updateMany({ data: { createdAt: old } });
    const pending = await ctx.prisma.emailOutbox.create({
      data: {
        userId,
        to: 'ada@trek.test',
        template: 'WELCOME',
        subject: 'Old but unsent',
        text: 'text',
        html: '<p>html</p>',
        createdAt: old,
      },
    });

    await outbox.purgeOld();

    const left = await ctx.prisma.emailOutbox.findMany();
    expect(left.map((e) => e.id)).toEqual([pending.id]);
  });

  it('deleting a user drops their queued emails', async () => {
    await ctx.signUp('leaving@trek.test');
    const leaving = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: 'leaving@trek.test' },
    });
    expect(
      await ctx.prisma.emailOutbox.count({ where: { userId: leaving.id } }),
    ).toBe(1);

    await as(admin).delete(`/api/users/${leaving.id}`).expect(200);

    expect(
      await ctx.prisma.emailOutbox.count({ where: { userId: leaving.id } }),
    ).toBe(0);
  });
});
