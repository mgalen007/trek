import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { Prisma } from '../../generated/prisma/client';
import { getPaginationParams } from 'common/helpers/pagination.helpers';
import { toPage } from 'common/http/page';
import { toDateOnly } from 'common/helpers/date.helpers';
import { HotelSearchParams } from './types/hotel-search.types';

@Injectable()
export class HotelsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  async create(dto: CreateHotelDto) {
    const hotel = await this.prisma.hotel.create({ data: dto });

    return hotel;
  }

  async findOneById(id: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw new NotFoundException('Hotel not found');

    return hotel;
  }

  async findAll(query: HotelSearchParams) {
    const { skip, l: limit } = getPaginationParams(query.page, query.limit);
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);
    const stay = this.parseStay(query);

    if (!stay) {
      const [hotels, total] = await this.prisma.$transaction([
        this.prisma.hotel.findMany({
          where,
          orderBy,
          include: { destination: true },
          take: limit,
          skip,
        }),
        this.prisma.hotel.count({ where }),
      ]);

      return toPage(hotels, skip, limit, total);
    }

    // Availability depends on bookings, so it can't be a plain SQL filter:
    // rank every candidate, keep those with enough free rooms, then page.
    const candidates = await this.prisma.hotel.findMany({
      where: { ...where, totalRooms: { gte: stay.rooms } },
      orderBy,
      select: { id: true, totalRooms: true },
    });
    const available = await this.inventory.availableRoomsByHotel(
      candidates,
      stay.checkIn,
      stay.checkOut,
    );
    const matching = candidates.filter(
      (h) => (available.get(h.id) ?? 0) >= stay.rooms,
    );
    const pageIds = matching.slice(skip, skip + limit).map((h) => h.id);

    const page = await this.prisma.hotel.findMany({
      where: { id: { in: pageIds } },
      include: { destination: true },
    });
    const byId = new Map(page.map((h) => [h.id, h]));
    const hotels = pageIds.map((id) => ({
      ...byId.get(id)!,
      availableRooms: available.get(id)!,
    }));

    return toPage(hotels, skip, limit, matching.length);
  }

  async update(id: string, dto: UpdateHotelDto) {
    const hotel = await this.prisma.hotel.update({
      where: { id },
      data: dto,
    });

    return hotel;
  }

  async remove(id: string) {
    const hotel = await this.prisma.hotel.delete({ where: { id } });

    return hotel;
  }

  private buildWhere(query: HotelSearchParams): Prisma.HotelWhereInput {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    )
      throw new BadRequestException('minPrice cannot be above maxPrice');

    return {
      destinationId: query.destinationId,
      nightlyRate: { gte: query.minPrice, lte: query.maxPrice },
      rating:
        query.minRating !== undefined ? { gte: query.minRating } : undefined,
      currency: query.currency
        ? { equals: query.currency, mode: 'insensitive' }
        : undefined,
      // Without dates, `rooms` just means "has at least this many rooms".
      totalRooms: query.rooms ? { gte: query.rooms } : undefined,
    };
  }

  private buildOrderBy(
    query: HotelSearchParams,
  ): Prisma.HotelOrderByWithRelationInput[] {
    const order = query.order ?? 'asc';
    const primary: Prisma.HotelOrderByWithRelationInput =
      query.sort === 'price'
        ? { nightlyRate: order }
        : query.sort === 'rating'
          ? { rating: { sort: order, nulls: 'last' } }
          : { name: order };

    // id breaks ties so pages never overlap or skip hotels.
    return [primary, { id: 'asc' }];
  }

  private parseStay(query: HotelSearchParams) {
    if (!query.checkIn && !query.checkOut) return null;
    if (!query.checkIn || !query.checkOut)
      throw new BadRequestException(
        'checkIn and checkOut must be given together',
      );

    const checkIn = toDateOnly(query.checkIn);
    const checkOut = toDateOnly(query.checkOut);
    if (checkOut <= checkIn)
      throw new BadRequestException('checkOut must be after checkIn');
    if (checkIn < toDateOnly(new Date()))
      throw new BadRequestException('checkIn cannot be in the past');

    return { checkIn, checkOut, rooms: query.rooms ?? 1 };
  }
}
