import {
  BadRequestException,
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import type { Application } from 'express';
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

// Express "trust proxy": a hop count ("1"), "true", or a list of addresses.
// Needed behind a load balancer so rate limits see client IPs, not its own.
const parseTrustProxy = (value: string) =>
  /^\d+$/.test(value) ? Number(value) : value === 'true' ? true : value;

// Shared by main.ts and the e2e tests so both run the same pipeline.
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);

  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy)
    (app.getHttpAdapter().getInstance() as Application).set(
      'trust proxy',
      parseTrustProxy(trustProxy),
    );

  // Helmet's defaults suit Swagger UI too (same-origin scripts, inline
  // styles). upgrade-insecure-requests is dropped: it breaks the docs page
  // over plain HTTP, and TLS is the deployment's job.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );

  // Off unless configured: the agent calls the API server-to-server, CORS is
  // only for browser frontends.
  const corsOrigins = config.get<string>('CORS_ORIGINS');
  if (corsOrigins)
    app.enableCors({
      origin: corsOrigins.split(',').map((origin) => origin.trim()),
      exposedHeaders: [
        'Idempotent-Replayed',
        'Retry-After',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
      ],
    });

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
