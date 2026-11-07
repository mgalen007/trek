import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { apiError, ErrorCode } from 'common/http/api-error';

type Db = PrismaService | Prisma.TransactionClient;

// A token that was just rotated may come back once more within this window:
// a client retrying a refresh whose response it never received, or two
// requests refreshing at the same moment. That is answered with another
// token instead of being treated as theft.
export const REUSE_GRACE_MS = 30_000;

const DEFAULT_TTL_DAYS = 30;

// Tokens are 256 random bits, so a fast hash is enough to make a leaked
// table useless; bcrypt would only slow down every refresh.
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const invalid = () =>
  new UnauthorizedException(
    apiError(
      ErrorCode.INVALID_REFRESH_TOKEN,
      'Refresh token is invalid, expired or revoked; log in again',
    ),
  );

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokensService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private ttlMs() {
    const days = Number(
      this.config.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? DEFAULT_TTL_DAYS,
    );
    return (days > 0 ? days : DEFAULT_TTL_DAYS) * 86_400_000;
  }

  /** Starts a new session (token family) for a user who just logged in. */
  async startSession(userId: string) {
    // Expired tokens are useless; drop the user's old ones while we're here.
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
    return this.issue(userId, randomUUID());
  }

  /**
   * Exchanges a refresh token for its successor in the same session and
   * returns the user to sign a new access token for.
   */
  async rotate(token: string) {
    const now = new Date();
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, role: true } } },
    });
    if (!row || row.revokedAt || row.expiresAt <= now) throw invalid();

    if (row.usedAt && now.getTime() - row.usedAt.getTime() > REUSE_GRACE_MS) {
      // Someone is replaying an old token: either it was stolen or the
      // legitimate client was. Kill the whole session so neither can go on.
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException(
        apiError(
          ErrorCode.REFRESH_TOKEN_REUSED,
          'Refresh token was already used; the session has been revoked, log in again',
        ),
      );
    }

    const next = await this.prisma.$transaction(async (tx) => {
      if (!row.usedAt) {
        const { count } = await tx.refreshToken.updateMany({
          where: { id: row.id, usedAt: null, revokedAt: null },
          data: { usedAt: now },
        });
        // Not claimed: either a concurrent refresh of the same token got
        // there first (fine, we're inside the grace window) or the session
        // was revoked meanwhile.
        if (count === 0) {
          const current = await tx.refreshToken.findUnique({
            where: { id: row.id },
            select: { revokedAt: true },
          });
          if (!current || current.revokedAt) throw invalid();
        }
      }
      return this.issue(row.userId, row.familyId, tx);
    });

    return { user: row.user, refreshToken: next };
  }

  /** Ends the session the token belongs to. Unknown tokens are ignored. */
  async revokeSession(token: string) {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { familyId: true },
    });
    if (row) await this.revokeFamily(row.familyId);
  }

  /** Ends every session of a user. */
  async revokeAllSessions(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(
    userId: string,
    familyId: string,
    db: Db = this.prisma,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs());
    await db.refreshToken.create({
      data: { userId, familyId, tokenHash: hashToken(token), expiresAt },
    });
    return { token, expiresAt };
  }
}
