import {
  BadRequestException,
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { EnvelopeInterceptor } from '../common/http/envelope.interceptor';
import { apiError, ErrorCode } from '../common/http/api-error';
import { setupOpenApi } from './openapi';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';

// Flattens nested class-validator errors into [{ field, errors }], with
// dotted paths for nested fields (e.g. "address.city").
const toFieldErrors = (
  errors: ValidationError[],
  parent?: string,
): { field: string; errors: string[] }[] =>
  errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints
      ? [{ field, errors: Object.values(e.constraints) }]
      : [];
    return [...own, ...toFieldErrors(e.children ?? [], field)];
  });

// Shared by main.ts and the e2e tests so both run the same pipeline.
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ApiExceptionFilter(httpAdapter));
  // Order matters: idempotency is outermost so it stores and replays the
  // final enveloped body.
  app.useGlobalInterceptors(
    app.get(IdempotencyInterceptor),
    new EnvelopeInterceptor(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) =>
        new BadRequestException(
          apiError(
            ErrorCode.VALIDATION_FAILED,
            'Request validation failed',
            toFieldErrors(errors),
          ),
        ),
    }),
  );

  setupOpenApi(app);
}
