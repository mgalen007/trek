import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { apiError, ErrorCode } from 'common/http/api-error';

// Completed keys are replayed for a day, like Stripe.
export const KEY_TTL_MS = 24 * 60 * 60 * 1000;
// A key still "in progress" after this long belongs to a request that died
// (e.g. the server restarted), so a retry may take it over.
export const LOCK_TIMEOUT_MS = 60 * 1000;

export interface RequestFingerprint {
  method: string;
  path: string;
  requestHash: string;
}

export type Claim =
  { kind: 'new'; id: string } | { kind: 'replay'; body: unknown };

@Injectable()
export class IdempotencyService {
  constructor(private prisma: PrismaService) {}

  // Reserves (userId, key) for this request, or explains why it can't run:
  // a stored response to replay, a different request (422), or one still
  // running (409). The unique constraint makes concurrent claims safe.
  async claim(
    userId: string,
    key: string,
    fingerprint: RequestFingerprint,
  ): Promise<Claim> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await this.prisma.idempotencyKey.create({
          data: { userId, key, ...fingerprint },
        });
        return { kind: 'new', id: row.id };
      } catch (err) {
        const taken =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (!taken) throw err;
      }

      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { userId_key: { userId, key } },
      });
      // Released or expired between our insert and this read: try again.
      if (!existing) continue;

      const age = Date.now() - existing.createdAt.getTime();
      const stale = existing.completedAt
        ? age > KEY_TTL_MS
        : age > LOCK_TIMEOUT_MS;
      if (stale) {
        await this.prisma.idempotencyKey.deleteMany({
          where: { id: existing.id },
        });
        continue;
      }

      if (
        existing.method !== fingerprint.method ||
        existing.path !== fingerprint.path ||
        existing.requestHash !== fingerprint.requestHash
      )
        throw new UnprocessableEntityException(
          apiError(
            ErrorCode.IDEMPOTENCY_KEY_REUSED,
            'This Idempotency-Key was already used for a different request',
          ),
        );

      if (!existing.completedAt) break;

      return { kind: 'replay', body: existing.responseBody };
    }

    throw new ConflictException(
      apiError(
        ErrorCode.IDEMPOTENCY_IN_PROGRESS,
        'A request with this Idempotency-Key is still in progress; retry shortly',
      ),
    );
  }

  // Stores the response as plain JSON (Decimals and Dates become strings),
  // exactly as the client received it.
  async complete(id: string, body: unknown) {
    await this.prisma.idempotencyKey.update({
      where: { id },
      data: {
        completedAt: new Date(),
        responseBody: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue,
      },
    });
  }

  // Failed requests aren't remembered, so the same key can be retried.
  async release(id: string) {
    await this.prisma.idempotencyKey.deleteMany({ where: { id } });
  }
}
