import { HttpStatus, INestApplication } from '@nestjs/common';
import { DocumentBuilder, getSchemaPath, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/http/api-response.dto';

export const OPENAPI_PATH = 'api/docs';

// e.g. ("ItinerariesController", "confirm") -> "itineraries_confirm". These
// ids become method/tool names in generated clients, so they must be unique
// and stable.
const operationId = (controllerKey: string, methodKey: string) => {
  const resource = controllerKey.replace(/Controller$/, '');
  return `${resource.charAt(0).toLowerCase()}${resource.slice(1)}_${methodKey}`;
};

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Trek API')
    .setDescription(
      [
        'Travel booking and itinerary planning API.',
        '',
        'Successful responses are `{ data }`, or `{ data, pagination }` for lists.',
        'Errors are `{ statusCode, error: { code, message, details? } }`; branch on `error.code`.',
        '',
        'Authenticate with `POST /api/auth/login` and send `accessToken` as `Authorization: Bearer <token>`; renew it with `POST /api/auth/refresh`.',
        '',
        'Requests are rate limited per user (per IP when anonymous). A 429 `TOO_MANY_REQUESTS` carries a `Retry-After` header and `details.retryAfterSeconds`.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: operationId,
  });

  // Every route except the health checks can answer 429.
  for (const [path, item] of Object.entries(document.paths)) {
    if (path.startsWith('/api/health')) continue;
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!operation) continue;
      operation.responses[HttpStatus.TOO_MANY_REQUESTS] ??= {
        description:
          'Rate limit exceeded; wait `Retry-After` seconds (TOO_MANY_REQUESTS)',
        content: {
          'application/json': {
            schema: { $ref: getSchemaPath(ErrorResponseDto) },
          },
        },
      };
    }
  }

  return document;
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

// Serves Swagger UI at /api/docs and the raw spec at /api/docs-json.
export function setupOpenApi(app: INestApplication) {
  SwaggerModule.setup(OPENAPI_PATH, app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: `${OPENAPI_PATH}-json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
