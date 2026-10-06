import { ArgumentsHost, Logger } from '@nestjs/common';
import { AbstractHttpAdapter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: '7',
    meta,
  });

describe('PrismaExceptionFilter', () => {
  let reply: jest.Mock;
  let filter: PrismaExceptionFilter;
  const host = {
    getArgByIndex: () => ({}),
    getArgs: () => [],
    getType: () => 'http',
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    reply = jest.fn();
    filter = new PrismaExceptionFilter({
      reply,
      isHeadersSent: () => false,
      end: jest.fn(),
    } as unknown as AbstractHttpAdapter);
  });

  const respond = (err: Prisma.PrismaClientKnownRequestError) => {
    filter.catch(err, host);
    const [, body, status] = reply.mock.calls[0] as [
      unknown,
      { message: string },
      number,
    ];
    return { status, message: body.message };
  };

  it.each([
    ['P2025', { modelName: 'Hotel' }, 404, 'Hotel not found'],
    ['P2025', undefined, 404, 'Record not found'],
    ['P2002', { modelName: 'User' }, 409, 'User already exists'],
    ['P2003', undefined, 400, 'Referenced record does not exist'],
    [
      'P2034',
      undefined,
      409,
      'Booking conflicted with another request, please retry',
    ],
  ])('maps %s to %i', (code, meta, status, message) => {
    expect(respond(prismaError(code, meta))).toEqual({ status, message });
  });

  it('leaves unknown codes as 500s', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    expect(respond(prismaError('P1001')).status).toBe(500);
  });
});
