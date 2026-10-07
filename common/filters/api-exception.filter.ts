import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AbstractHttpAdapter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';
import { ApiErrorBody, ErrorCode } from '../http/api-error';
import { mapPrismaError } from './prisma-errors';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ApiErrorBody).code === 'string' &&
  typeof (value as ApiErrorBody).message === 'string';

// Every error leaves the API as
// `{ statusCode, error: { code, message, details? } }`.
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly httpAdapter: AbstractHttpAdapter) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const httpException =
      exception instanceof HttpException
        ? exception
        : exception instanceof Prisma.PrismaClientKnownRequestError
          ? mapPrismaError(exception)
          : undefined;

    let status: number;
    let error: ApiErrorBody;
    if (httpException) {
      status = httpException.getStatus();
      error = this.toErrorBody(status, httpException.getResponse());
    } else {
      // Unexpected failures are logged in full but never leaked to clients.
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      error = {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
      };
    }

    this.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      { statusCode: status, error },
      status,
    );
  }

  private toErrorBody(status: number, response: string | object): ApiErrorBody {
    if (isApiErrorBody(response)) return response;

    const code =
      CODE_BY_STATUS[status] ??
      (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
    if (typeof response === 'string') return { code, message: response };

    // Nest's built-in shape: { statusCode, message, error }.
    const { message } = response as { message?: string | string[] };
    if (Array.isArray(message))
      return {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Request validation failed',
        details: message,
      };

    return { code, message: message ?? 'Request failed' };
  }
}
