import { applyDecorators, HttpStatus, SetMetadata } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from 'common/http/api-response.dto';

export const IDEMPOTENT_KEY = 'idempotent';
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * Lets clients retry this route safely by sending an Idempotency-Key header
 * (see IdempotencyInterceptor). Use on authenticated POST routes.
 */
export const Idempotent = () =>
  applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),
    ApiHeader({
      name: IDEMPOTENCY_HEADER,
      required: false,
      description:
        'Unique string (1-255 visible ASCII characters, e.g. a UUID) that makes retries safe: a repeat with the same key and body within 24 hours returns the first successful response (with `Idempotent-Replayed: true`) instead of acting again. Failed requests are not remembered, so they can be retried with the same key. While the first request is still running, repeats get 409 IDEMPOTENCY_IN_PROGRESS.',
      schema: { type: 'string', minLength: 1, maxLength: 255 },
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'Idempotency-Key already used for a different request (IDEMPOTENCY_KEY_REUSED)',
      type: ErrorResponseDto,
    }),
  );
