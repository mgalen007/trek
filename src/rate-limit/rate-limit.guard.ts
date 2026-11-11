import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { apiError, ErrorCode } from 'common/http/api-error';
import type { JwtPayload } from '../auth/types/jwt.types';

/**
 * Rate limits signed-in requests per user and anonymous ones per IP.
 *
 * The AI agent calls the API for many users from one server, so per-IP
 * limits alone would make those users share a single budget. The token is
 * verified (not just decoded) so a forged `sub` can't buy fresh budgets.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  @Inject(JwtService) private readonly jwt: JwtService;

  protected async getTracker(req: Request): Promise<string> {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const { sub, kind } = await this.jwt.verifyAsync<JwtPayload>(
          header.slice('Bearer '.length),
        );
        // The agent has its own budget, so a busy agent can't lock the user
        // out of their own account.
        return kind === 'agent' ? `agent:${sub}` : `user:${sub}`;
      } catch {
        // Invalid or expired: rate limit by IP, auth will reject it anyway.
      }
    }
    return `ip:${req.ip}`;
  }

  // The named "auth" limit would only set `Retry-After-auth`; clients and
  // the agent expect the standard header and a code to branch on.
  protected throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSeconds = Math.max(1, detail.timeToBlockExpire);
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', retryAfterSeconds);
    throw new HttpException(
      apiError(
        ErrorCode.TOO_MANY_REQUESTS,
        `Too many requests; retry in ${retryAfterSeconds}s`,
        { retryAfterSeconds },
      ),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
