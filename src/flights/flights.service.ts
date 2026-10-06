import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'
import { UpdateFlightDto } from './dto/update-flight.dto';
import { CreateFlightDto } from './dto/create-flight.dto';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { getPaginationParams, paginationMetadata } from 'common/helpers/pagination.helpers';


@Injectable()
export class FlightsService {
  constructor(private prisma: PrismaService) { }

  private validateRoute(flight: Pick<CreateFlightDto, 'departureAirportId' | 'arrivalAirportId' | 'departureAt' | 'arrivalAt'>) {
    if (flight.departureAirportId === flight.arrivalAirportId)
      throw new BadRequestException('Departure and arrival airports must differ')
    if (new Date(flight.arrivalAt) <= new Date(flight.departureAt))
      throw new BadRequestException('arrivalAt must be after departureAt')
  }

  async create(dto: CreateFlightDto) {
    this.validateRoute(dto)
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

    return { flights, pagination: paginationMetadata(skip, limit) }
  }

  async update(id: string, dto: UpdateFlightDto) {
    const existing = await this.findOneById(id)
    this.validateRoute({
      departureAirportId: dto.departureAirportId ?? existing.departureAirportId,
      arrivalAirportId: dto.arrivalAirportId ?? existing.arrivalAirportId,
      departureAt: dto.departureAt ?? existing.departureAt,
      arrivalAt: dto.arrivalAt ?? existing.arrivalAt,
    })

    const flight = await this.prisma.flight.update({
      where: { id },
      data: dto
    })

    return flight
  }

  async remove(id: string) {
    const flight = await this.prisma.flight.delete({ where: { id } })

    return flight
  }
}
