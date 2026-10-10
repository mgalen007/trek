import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { catchError, from, mergeMap, Observable, of, throwError } from 'rxjs';
import { apiError, ErrorCode } from 'common/http/api-error';
import { stableStringify } from 'common/helpers/stable-stringify';
import { IdempotencyService } from './idempotency.service';
import { IDEMPOTENCY_HEADER, IDEMPOTENT_KEY } from './idempotent.decorator';

const VALID_KEY = /^[\x21-\x7E]{1,255}$/;

/**
 * For routes marked @Idempotent(): when the request carries an
 * Idempotency-Key, the first successful response is stored per user and key,
 * and repeats get that response back without running the handler again.
 *
 * Registered globally *outside* EnvelopeInterceptor, so it stores and
 * replays the final `{ data }` body.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private reflector: Reflector,
    private idempotency: IdempotencyService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (!this.reflector.get<boolean>(IDEMPOTENT_KEY, context.getHandler()))
      return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id: string } }>();
    const key = req.header(IDEMPOTENCY_HEADER);
    // Keys are scoped per user, so anonymous requests can't use them.
    if (key === undefined || !req.user) return next.handle();
    if (!VALID_KEY.test(key))
      throw new BadRequestException(
        apiError(
          ErrorCode.BAD_REQUEST,
          `${IDEMPOTENCY_HEADER} must be 1-255 visible ASCII characters`,
        ),
      );

    const claim = await this.idempotency.claim(req.user.id, key, {
      method: req.method,
      path: req.originalUrl,
      requestHash: createHash('sha256')
        .update(stableStringify(req.body ?? null))
        .digest('hex'),
    });

    if (claim.kind === 'replay') {
      http.getResponse<Response>().setHeader('Idempotent-Replayed', 'true');
      return of(claim.body);
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        try {
          await this.idempotency.complete(claim.id, body);
        } catch (err) {
          // The work is done; don't fail the response because the key
          // couldn't be saved. Retries will wait out the lock timeout.
          this.logger.error(
            `Could not store idempotent response: ${String(err)}`,
          );
        }
        return body;
      }),
      catchError((err: unknown) =>
        from(this.idempotency.release(claim.id)).pipe(
          mergeMap(() => throwError(() => err)),
        ),
      ),
    );
  }
}
