import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  ItineraryEventType,
  ItineraryStatus,
} from '../../generated/prisma/client';
import { KEY_TTL_MS } from '../idempotency/idempotency.service';
import { recordEvent, SYSTEM } from '../itineraries/itinerary-events';
import { toDateOnly } from 'common/helpers/date.helpers';

// Revoked refresh tokens are kept a day for troubleshooting; they're already
// unusable, so dropping them later changes nothing for clients.
const REVOKED_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;

// Itineraries are completed in batches so one run never holds a huge result.
const COMPLETION_BATCH = 200;

/**
 * Housekeeping on a schedule. Every job is safe to run concurrently on
 * several instances (deletes and conditional updates), and each method can
 * be called directly, e.g. from tests. SCHEDULED_JOBS=off disables the
 * schedule (the e2e tests do this).
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly running = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
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
        select: { id: true, endDate: true },
        take: COMPLETION_BATCH,
      });
      if (!due.length) return completed;

      for (const { id, endDate } of due) {
        await this.prisma.$transaction(async (tx) => {
          // Conditional, so a concurrent cancel or another instance's run
          // wins cleanly and no second event is written.
          const { count } = await tx.itinerary.updateMany({
            where: { id, status: ItineraryStatus.PLANNED },
            data: { status: ItineraryStatus.COMPLETED },
          });
          if (!count) return;
          await recordEvent(tx, id, SYSTEM, ItineraryEventType.COMPLETED, {
            endDate: endDate.toISOString().slice(0, 10),
          });
          completed++;
        });
      }
    }
  }

  private async run(name: string, job: () => Promise<number>) {
    if (this.config.get<string>('SCHEDULED_JOBS') === 'off') return;
    // A slow run shouldn't overlap with the next tick.
    if (this.running.has(name)) return;
    this.running.add(name);
    const started = Date.now();
    try {
      const count = await job();
      if (count)
        this.logger.log(
          `${name}: ${count} row(s) in ${Date.now() - started}ms`,
        );
    } catch (err) {
      this.logger.error(`${name} failed: ${String(err)}`);
    } finally {
      this.running.delete(name);
    }
  }
}
