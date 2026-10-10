// Machine-readable error codes returned as `error.code` in every error
// response, so clients (and the AI agent) can branch on them instead of
// parsing messages.
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  INVALID_STATUS: 'INVALID_STATUS',
  ROOMS_UNAVAILABLE: 'ROOMS_UNAVAILABLE',
  SEATS_UNAVAILABLE: 'SEATS_UNAVAILABLE',
  BOOKING_CONFLICT: 'BOOKING_CONFLICT',
  TRAVELER_IN_USE: 'TRAVELER_IN_USE',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

// Payload for Nest's HTTP exceptions when a specific code is wanted, e.g.
// `new ConflictException(apiError(ErrorCode.ROOMS_UNAVAILABLE, '...'))`.
// Exceptions thrown with a plain message get a code derived from the status.
export const apiError = (
  code: ErrorCode,
  message: string,
  details?: unknown,
): ApiErrorBody =>
  details === undefined ? { code, message } : { code, message, details };
