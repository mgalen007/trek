import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
        'Authenticate with `POST /api/auth/login` and send the token as `Authorization: Bearer <token>`.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: operationId,
  });
}

// Serves Swagger UI at /api/docs and the raw spec at /api/docs-json.
export function setupOpenApi(app: INestApplication) {
  SwaggerModule.setup(OPENAPI_PATH, app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: `${OPENAPI_PATH}-json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
