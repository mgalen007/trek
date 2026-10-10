import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '../../generated/prisma/client';
import { Role } from '../auth/types/auth.types';
import type { ICurrentUser } from '../auth/types/user.types';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { getPaginationParams } from 'common/helpers/pagination.helpers';
import { toDateOnly } from 'common/helpers/date.helpers';
import { toPage } from 'common/http/page';
import { apiError, ErrorCode } from 'common/http/api-error';
import { CreateTravelerDto } from './dto/create-traveler.dto';
import { UpdateTravelerDto } from './dto/update-traveler.dto';

@Injectable()
export class TravelersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTravelerDto, currentUser: ICurrentUser) {
    const traveler = await this.prisma.traveler.create({
      data: {
        ...dto,
        dateOfBirth: toDateOnly(dto.dateOfBirth),
        userId: currentUser.id,
      },
    });

    return traveler;
  }

  async findAll(currentUser: ICurrentUser, query: PaginationQueryParams) {
    const { skip, l: limit } = getPaginationParams(query.page, query.limit);
    const where = { userId: currentUser.id };
    const [travelers, total] = await this.prisma.$transaction([
      this.prisma.traveler.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: limit,
        skip,
      }),
      this.prisma.traveler.count({ where }),
    ]);

    return toPage(travelers, skip, limit, total);
  }

  async findOne(id: string, currentUser: ICurrentUser) {
    return this.getOwnedOrFail(id, currentUser);
  }

  async update(id: string, currentUser: ICurrentUser, dto: UpdateTravelerDto) {
    await this.getOwnedOrFail(id, currentUser);

    const traveler = await this.prisma.traveler.update({
      where: { id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? toDateOnly(dto.dateOfBirth) : undefined,
      },
    });

    return traveler;
  }

  // Travelers on held or confirmed flight bookings can't be deleted; once
  // those bookings are removed or cancelled, the traveler can go.
  async remove(id: string, currentUser: ICurrentUser) {
    await this.getOwnedOrFail(id, currentUser);

    const activeBookings = await this.prisma.itineraryFlight.count({
      where: {
        travelers: { some: { id } },
        status: { not: BookingStatus.CANCELLED },
      },
    });
    if (activeBookings)
      throw new ConflictException(
        apiError(
          ErrorCode.TRAVELER_IN_USE,
          `Traveler is on ${activeBookings} active flight booking(s); remove them or cancel the itinerary first`,
        ),
      );

    return this.prisma.traveler.delete({ where: { id } });
  }

  // Used when booking flights: every id must be a traveler owned by the
  // itinerary's owner.
  async assertOwnedBy(ownerId: string, travelerIds: string[]) {
    const found = await this.prisma.traveler.findMany({
      where: { id: { in: travelerIds }, userId: ownerId },
      select: { id: true },
    });
    const known = new Set(found.map((t) => t.id));
    const unknown = travelerIds.filter((id) => !known.has(id));
    if (unknown.length)
      throw new BadRequestException(
        apiError(
          ErrorCode.INVALID_REFERENCE,
          `Unknown traveler id(s): ${unknown.join(', ')}`,
        ),
      );
  }

  // Other users' travelers are reported as missing rather than forbidden,
  // so their existence isn't leaked.
  private async getOwnedOrFail(id: string, currentUser: ICurrentUser) {
    const traveler = await this.prisma.traveler.findUnique({ where: { id } });
    if (
      !traveler ||
      (traveler.userId !== currentUser.id && currentUser.role !== Role.ADMIN)
    )
      throw new NotFoundException('Traveler not found');

    return traveler;
  }
}
