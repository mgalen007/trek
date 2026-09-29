import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'
import { UpdateFlightDto } from './dto/update-flight.dto';
import { CreateFlightDto } from './dto/create-flight.dto';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { getPaginationParams } from 'common/helpers/pagination.helpers';


@Injectable()
export class FlightsService {
  constructor(private prisma: PrismaService) { }

  async create(dto: CreateFlightDto) {
    const flight = await this.prisma.flight.create({ data: dto })

    return flight
  }

  async findOneById(id: string) {
    const flight = await this.prisma.flight.findUnique({ where: { id } })
    if (!flight) throw new NotFoundException('Flight not found')

    return flight
  }

  async findAll(options: PaginationQueryParams) {
    const { skip, l: limit } = getPaginationParams(options.page, options.limit)
    const flights = await this.prisma.flight.findMany({
      take: limit,
      skip
    })

    return flights
  }

  async update(id: string, dto: UpdateFlightDto) {
    const flight = await this.prisma.flight.update({
      where: { id },
      data: dto
    })
    if (!flight) throw new NotFoundException('Flight not found')

    return flight
  }

  async remove(id: string) {
    const flight = await this.prisma.flight.delete({ where: { id } })
    if (!flight) throw new NotFoundException('Flight not found')

    return flight
  }
}
