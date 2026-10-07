import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateFlightDto } from './dto/update-flight.dto';
import { CreateFlightDto } from './dto/create-flight.dto';
import { Prisma } from '../../generated/prisma/client';
import { getPaginationParams } from 'common/helpers/pagination.helpers';
import { toPage } from 'common/http/page';
import { addDays, toDateOnly } from 'common/helpers/date.helpers';
import { FlightSearchParams } from './types/flight-search.types';

const AIRPORTS_INCLUDE = {
  departureAirport: true,
  arrivalAirport: true,
} satisfies Prisma.FlightInclude;

@Injectable()
export class FlightsService {
  constructor(private prisma: PrismaService) {}

  private validateRoute(
    flight: Pick<
      CreateFlightDto,
      'departureAirportId' | 'arrivalAirportId' | 'departureAt' | 'arrivalAt'
    >,
  ) {
    if (flight.departureAirportId === flight.arrivalAirportId)
      throw new BadRequestException(
        'Departure and arrival airports must differ',
      );
    if (new Date(flight.arrivalAt) <= new Date(flight.departureAt))
      throw new BadRequestException('arrivalAt must be after departureAt');
  }

  async create(dto: CreateFlightDto) {
    this.validateRoute(dto);
    const flight = await this.prisma.flight.create({ data: dto });

    return flight;
  }

  async findOneById(id: string) {
    const flight = await this.prisma.flight.findUnique({
      where: { id },
      include: AIRPORTS_INCLUDE,
    });
    if (!flight) throw new NotFoundException('Flight not found');

    return flight;
  }

  // Only upcoming flights are listed; past ones are still reachable by id.
  async findAll(query: FlightSearchParams) {
    const { skip, l: limit } = getPaginationParams(query.page, query.limit);
    const where = this.buildWhere(query);
    const order = query.order ?? 'asc';
    const orderBy: Prisma.FlightOrderByWithRelationInput[] = [
      query.sort === 'price' ? { price: order } : { departureAt: order },
      // id breaks ties so pages never overlap or skip flights.
      { id: 'asc' },
    ];

    const [flights, total] = await this.prisma.$transaction([
      this.prisma.flight.findMany({
        where,
        orderBy,
        include: AIRPORTS_INCLUDE,
        take: limit,
        skip,
      }),
      this.prisma.flight.count({ where }),
    ]);

    return toPage(flights, skip, limit, total);
  }

  private buildWhere(query: FlightSearchParams): Prisma.FlightWhereInput {
    const airport = (code?: string, destinationId?: string) =>
      code || destinationId
        ? {
            code: code
              ? { equals: code, mode: 'insensitive' as const }
              : undefined,
            destinationId,
          }
        : undefined;

    const now = new Date();
    const day = query.date ? toDateOnly(query.date) : undefined;

    return {
      departureAirport: airport(query.from, query.fromDestinationId),
      arrivalAirport: airport(query.to, query.toDestinationId),
      departureAt: {
        gt: now,
        gte: day,
        lt: day ? addDays(day, 1) : undefined,
      },
      availableSeats: query.passengers ? { gte: query.passengers } : undefined,
      price: query.maxPrice !== undefined ? { lte: query.maxPrice } : undefined,
      currency: query.currency
        ? { equals: query.currency, mode: 'insensitive' }
        : undefined,
    };
  }

  async update(id: string, dto: UpdateFlightDto) {
    const existing = await this.findOneById(id);
    this.validateRoute({
      departureAirportId: dto.departureAirportId ?? existing.departureAirportId,
      arrivalAirportId: dto.arrivalAirportId ?? existing.arrivalAirportId,
      departureAt: dto.departureAt ?? existing.departureAt,
      arrivalAt: dto.arrivalAt ?? existing.arrivalAt,
    });

    const flight = await this.prisma.flight.update({
      where: { id },
      data: dto,
    });

    return flight;
  }

  async remove(id: string) {
    const flight = await this.prisma.flight.delete({ where: { id } });

    return flight;
  }
}
