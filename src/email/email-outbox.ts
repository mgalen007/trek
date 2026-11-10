import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RenderedEmail } from './templates';

type Db = PrismaService | Prisma.TransactionClient;

/** Outbox fields for a nested `emails: { create }` under a user. */
export const outboxData = (to: string, email: RenderedEmail) => ({
  to,
  ...email,
});

/**
 * Queues an email. Call it with the transaction client of the change being
 * reported, so the email only exists if that change commits.
 */
export const queueEmail = (
  db: Db,
  userId: string,
  to: string,
  email: RenderedEmail,
) => db.emailOutbox.create({ data: { userId, ...outboxData(to, email) } });
