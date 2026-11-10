import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobRunner } from './job-runner.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ItineraryEventType,
  ItineraryStatus,
} from '../../generated/prisma/client';
import { KEY_TTL_MS } from '../idempotency/idempotency.service';
import { recordEvent, SYSTEM } from '../itineraries/itinerary-events';
import { toDateOnly } from 'common/helpers/date.helpers';
import { queueEmail } from '../email/email-outbox';
import { itineraryCompletedEmail, tripSummary } from '../email/templates';

const day = (date: Date) => date.toISOString().slice(0, 10);

// Revoked refresh tokens are kept a day for troubleshooting; they're already
// unusable, so dropping them later changes nothing for clients.
const REVOKED_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;

// Itineraries are completed in batches so one run never holds a huge result.
const COMPLETION_BATCH = 200;

/**
 * Housekeeping on a schedule. Every job is safe to run concurrently on
 * several instances (deletes and conditional updates), and each method can
 * be called directly, e.g. from tests.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private prisma: PrismaService,
    private jobs: JobRunner,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'purge-idempotency-keys',
    timeZone: 'UTC',
  })
  runPurgeIdempotencyKeys() {
    return this.run('purge-idempotency-keys', () =>
      this.purgeIdempotencyKeys(),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'purge-refresh-tokens',
    timeZone: 'UTC',
  })
  runPurgeRefreshTokens() {
    return this.run('purge-refresh-tokens', () => this.purgeRefreshTokens());
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'complete-past-itineraries',
    timeZone: 'UTC',
  })
  runCompletePastItineraries() {
    return this.run('complete-past-itineraries', () =>
      this.completePastItineraries(),
    );
  }

  /** Idempotency keys past their 24h lifetime, finished or abandoned. */
  async purgeIdempotencyKeys() {
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - KEY_TTL_MS) } },
    });
    return count;
  }

  /** Expired refresh tokens, and revoked ones after a day. */
  async purgeRefreshTokens() {
    const now = Date.now();
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(now) } },
          { revokedAt: { lt: new Date(now - REVOKED_TOKEN_RETENTION_MS) } },
        ],
      },
    });
    return count;
  }

  /**
   * PLANNED itineraries whose last day is before today (UTC) become
   * COMPLETED, with a COMPLETED event by the system. Bookings stay
   * CONFIRMED as the record of what was used.
   */
  async completePastItineraries() {
    const today = toDateOnly(new Date());
    let completed = 0;

    for (;;) {
      const due = await this.prisma.itinerary.findMany({
        where: { status: ItineraryStatus.PLANNED, endDate: { lt: today } },
        include: {
          user: { select: { id: true, email: true, firstName: true } },
          destination: { select: { name: true } },
        },
        take: COMPLETION_BATCH,
      });
      if (!due.length) return completed;

      for (const trip of due) {
        await this.prisma.$transaction(async (tx) => {
          // Conditional, so a concurrent cancel or another instance's run
          // wins cleanly and no second event or email is written.
          const { count } = await tx.itinerary.updateMany({
            where: { id: trip.id, status: ItineraryStatus.PLANNED },
            data: { status: ItineraryStatus.COMPLETED },
          });
          if (!count) return;
          await recordEvent(tx, trip.id, SYSTEM, ItineraryEventType.COMPLETED, {
            endDate: day(trip.endDate),
          });
          await queueEmail(
            tx,
            trip.user.id,
            trip.user.email,
            itineraryCompletedEmail(trip.user.firstName, tripSummary(trip)),
          );
          completed++;
        });
      }
    }
  }

  private run(name: string, job: () => Promise<number>) {
    return this.jobs.run(name, job);
  }
}
