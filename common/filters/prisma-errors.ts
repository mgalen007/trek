import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { apiError, ErrorCode } from '../http/api-error';

// Prisma throws instead of returning null when update()/delete() target a
// missing record, so known request errors are mapped to HTTP errors here.
// Unrecognised codes return undefined and surface as 500s.
export const mapPrismaError = (
  err: Prisma.PrismaClientKnownRequestError,
): HttpException | undefined => {
  const model =
    typeof err.meta?.modelName === 'string' ? err.meta.modelName : 'Record';

  switch (err.code) {
    case 'P2025':
      return new NotFoundException(
        apiError(ErrorCode.NOT_FOUND, `${model} not found`),
      );
    case 'P2002':
      return new ConflictException(
        apiError(ErrorCode.ALREADY_EXISTS, `${model} already exists`),
      );
    case 'P2003':
      return new BadRequestException(
        apiError(
          ErrorCode.INVALID_REFERENCE,
          'Referenced record does not exist',
        ),
      );
    case 'P2034':
      return new ConflictException(
        apiError(
          ErrorCode.BOOKING_CONFLICT,
          'Booking conflicted with another request, please retry',
        ),
      );
    default:
      return undefined;
  }
};
