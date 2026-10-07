import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';

// Prisma throws instead of returning null when update()/delete() target a
// missing record, so known request errors are mapped to HTTP errors here.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const model =
      typeof err.meta?.modelName === 'string' ? err.meta.modelName : 'Record';

    let mapped: HttpException | undefined;
    switch (err.code) {
      case 'P2025':
        mapped = new NotFoundException(`${model} not found`);
        break;
      case 'P2002':
        mapped = new ConflictException(`${model} already exists`);
        break;
      case 'P2003':
        mapped = new BadRequestException('Referenced record does not exist');
        break;
      case 'P2034':
        mapped = new ConflictException(
          'Booking conflicted with another request, please retry',
        );
        break;
    }

    super.catch(mapped ?? err, host);
  }
}
