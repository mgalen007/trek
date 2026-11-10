import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailStatus } from '../../generated/prisma/client';
import { JobRunner } from '../jobs/job-runner.service';
import { Mailer } from './mailer';

const BATCH = 20;
// How long a claimed email stays reserved for the sender working on it. A
// sender that crashes mid-batch leaves its emails to be retried after this,
// so delivery is at-least-once.
const LEASE_MS = 5 * 60_000;
// Wait before retry n (1-based); the attempt after the last one is final.
export const RETRY_DELAYS_MS = [1, 5, 30, 120, 720].map((min) => min * 60_000);
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const RETENTION_MS = 30 * 24 * 60 * 60_000;

@Injectable()
export class EmailOutboxService {
  constructor(
    private prisma: PrismaService,
    private mailer: Mailer,
    private jobs: JobRunner,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'send-emails', timeZone: 'UTC' })
  runSendPending() {
    return this.jobs.run('send-emails', () => this.sendPending());
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, {
    name: 'purge-emails',
    timeZone: 'UTC',
  })
  runPurge() {
    return this.jobs.run('purge-emails', () => this.purgeOld());
  }

  /** Sends due emails, oldest first; returns how many were delivered. */
  async sendPending() {
    let delivered = 0;
    for (const email of await this.claimDue()) {
      const attempts = email.attempts + 1;
      try {
        await this.mailer.send(email);
        await this.prisma.emailOutbox.update({
          where: { id: email.id },
          data: {
            status: EmailStatus.SENT,
            sentAt: new Date(),
            attempts,
            lastError: null,
          },
        });
        delivered++;
      } catch (err) {
        const final = attempts >= MAX_ATTEMPTS;
        await this.prisma.emailOutbox.update({
          where: { id: email.id },
          data: {
            status: final ? EmailStatus.FAILED : EmailStatus.PENDING,
            attempts,
            lastError: String(err).slice(0, 500),
            nextAttemptAt: new Date(
              Date.now() + (final ? 0 : RETRY_DELAYS_MS[attempts - 1]),
            ),
          },
        });
      }
    }
    return delivered;
  }

  /** Sent and failed emails older than 30 days. */
  async purgeOld() {
    const { count } = await this.prisma.emailOutbox.deleteMany({
      where: {
        status: { in: [EmailStatus.SENT, EmailStatus.FAILED] },
        createdAt: { lt: new Date(Date.now() - RETENTION_MS) },
      },
    });
    return count;
  }

  // Claims each due email with a compare-and-set on nextAttemptAt, so two
  // instances never send the same email at the same time.
  private async claimDue() {
    const now = new Date();
    const due = await this.prisma.emailOutbox.findMany({
      where: { status: EmailStatus.PENDING, nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    const lease = new Date(now.getTime() + LEASE_MS);
    const claimed: typeof due = [];
    for (const email of due) {
      const { count } = await this.prisma.emailOutbox.updateMany({
        where: {
          id: email.id,
          status: EmailStatus.PENDING,
          nextAttemptAt: email.nextAttemptAt,
        },
        data: { nextAttemptAt: lease },
      });
      if (count) claimed.push(email);
    }
    return claimed;
  }
}
