import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto, PaginationMetaDto } from './api-response.dto';

// OpenAPI descriptions of the envelopes produced by EnvelopeInterceptor and
// ApiExceptionFilter, so generated clients see the real response shapes.

const ref = (model: Type) => ({ $ref: getSchemaPath(model) });

/** `{ data: Model }` (or `{ data: Model[] }` with `isArray`). */
export const ApiDataResponse = (
  model: Type,
  options: { status?: number; description?: string; isArray?: boolean } = {},
) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description ?? 'Success',
      schema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: options.isArray
            ? { type: 'array', items: ref(model) }
            : ref(model),
        },
      },
    }),
  );

/** `{ data: Model[], pagination }` for paginated lists. */
export const ApiPageResponse = (
  model: Type,
  description = 'A page of results',
) =>
  applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiResponse({
      status: HttpStatus.OK,
      description,
      schema: {
        type: 'object',
        required: ['data', 'pagination'],
        properties: {
          data: { type: 'array', items: ref(model) },
          pagination: ref(PaginationMetaDto),
        },
      },
    }),
  );

const ERROR_DESCRIPTIONS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]:
    'Invalid input (VALIDATION_FAILED, BAD_REQUEST, INVALID_REFERENCE)',
  [HttpStatus.UNAUTHORIZED]: 'Missing or invalid bearer token (UNAUTHORIZED)',
  [HttpStatus.FORBIDDEN]: 'Authenticated but not allowed (FORBIDDEN)',
  [HttpStatus.NOT_FOUND]: 'Resource not found (NOT_FOUND)',
  [HttpStatus.CONFLICT]: 'Conflicts with current state',
};

/**
 * Documents error responses. Pass `{ [status]: description }` overrides to
 * list the specific codes a route can return.
 */
export const ApiErrorResponses = (
  statuses: number[],
  descriptions: Record<number, string> = {},
) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: descriptions[status] ?? ERROR_DESCRIPTIONS[status],
        type: ErrorResponseDto,
      }),
    ),
  );
