import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AbstractHttpAdapter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';
import { apiError, ErrorCode } from '../http/api-error';
import { ApiExceptionFilter } from './api-exception.filter';

type ErrorResponse = {
  statusCode: number;
  error: { code: string; message: string; details?: unknown };
};

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: '7',
    meta,
  });

describe('ApiExceptionFilter', () => {
  let reply: jest.Mock;
  let filter: ApiExceptionFilter;
  let logError: jest.SpyInstance;
  const host = {
    switchToHttp: () => ({ getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    reply = jest.fn();
    filter = new ApiExceptionFilter({
      reply,
    } as unknown as AbstractHttpAdapter);
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => logError.mockRestore());

  const respond = (exception: unknown) => {
    filter.catch(exception, host);
    const [, body, status] = reply.mock.calls[0] as [
      unknown,
      ErrorResponse,
      number,
    ];
    expect(body.statusCode).toBe(status);
    return body;
  };

  it('keeps codes given with apiError()', () => {
    const body = respond(
      new ConflictException(
        apiError(ErrorCode.ROOMS_UNAVAILABLE, 'Only 0 room(s) left', {
          hotelId: 'h',
        }),
      ),
    );

    expect(body).toEqual({
      statusCode: 409,
      error: {
        code: 'ROOMS_UNAVAILABLE',
        message: 'Only 0 room(s) left',
        details: { hotelId: 'h' },
      },
    });
  });

  it.each([
    [
      new NotFoundException('Hotel not found'),
      404,
      'NOT_FOUND',
      'Hotel not found',
    ],
    [new UnauthorizedException(), 401, 'UNAUTHORIZED', 'Unauthorized'],
    [
      new BadRequestException('Validation failed (uuid is expected)'),
      400,
      'BAD_REQUEST',
      'Validation failed (uuid is expected)',
    ],
  ])('derives the code from the status for %p', (ex, status, code, message) => {
    expect(respond(ex)).toEqual({
      statusCode: status,
      error: { code, message },
    });
  });

  it('reports message arrays as validation failures', () => {
    const body = respond(new BadRequestException(['name must be a string']));

    expect(body.error).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: ['name must be a string'],
    });
  });

  it.each([
    ['P2025', { modelName: 'Hotel' }, 404, 'NOT_FOUND', 'Hotel not found'],
    ['P2025', undefined, 404, 'NOT_FOUND', 'Record not found'],
    [
      'P2002',
      { modelName: 'User' },
      409,
      'ALREADY_EXISTS',
      'User already exists',
    ],
    [
      'P2003',
      undefined,
      400,
      'INVALID_REFERENCE',
      'Referenced record does not exist',
    ],
    [
      'P2034',
      undefined,
      409,
      'BOOKING_CONFLICT',
      'Booking conflicted with another request, please retry',
    ],
  ])('maps Prisma %s to %i %s', (prismaCode, meta, status, code, message) => {
    expect(respond(prismaError(prismaCode, meta))).toEqual({
      statusCode: status,
      error: { code, message },
    });
  });

  it.each([
    ['an unknown Prisma error', prismaError('P1001')],
    ['a plain Error', new Error('db password is hunter2')],
  ])('turns %s into a logged 500 without leaking it', (_case, exception) => {
    const body = respond(exception);

    expect(body).toEqual({
      statusCode: 500,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(logError).toHaveBeenCalled();
  });
});
