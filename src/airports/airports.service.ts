import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAirportDto } from './dto/create-airport.dto';
import { Prisma } from '../../generated/prisma/client';
import { AirportQueryParams } from './types/airport-query.types';
import { getPaginationParams } from 'common/helpers/pagination.helpers';
import { toPage } from 'common/http/page';
import { UpdateAirportDto } from './dto/update-airport.dto';

@Injectable()
export class AirportsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAirportDto) {
    const airport = await this.prisma.airport.create({ data: dto });

    return airport;
  }

  async findOneById(id: string) {
    const airport = await this.prisma.airport.findUnique({ where: { id } });
    if (!airport) throw new NotFoundException('Airport not found');

    return airport;
  }

  async findAll(query: AirportQueryParams) {
    const { skip, l: limit } = getPaginationParams(query.page, query.limit);
    const where: Prisma.AirportWhereInput = {
      destinationId: query.destinationId,
      code: query.code
        ? { equals: query.code, mode: 'insensitive' }
        : undefined,
    };
    const [airports, total] = await this.prisma.$transaction([
      this.prisma.airport.findMany({
        where,
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        take: limit,
        skip,
      }),
      this.prisma.airport.count({ where }),
    ]);

    return toPage(airports, skip, limit, total);
  }

  async update(id: string, dto: UpdateAirportDto) {
    const airport = await this.prisma.airport.update({
      where: { id },
      data: dto,
    });

    return airport;
  }

  async remove(id: string) {
    const airport = await this.prisma.airport.delete({ where: { id } });

    return airport;
  }
}
