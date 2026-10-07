import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  BookingStatus,
  ItineraryStatus,
  Prisma,
} from '../../generated/prisma/client';
import type { Itinerary } from '../../generated/prisma/client';
import { Role } from '../auth/types/auth.types';
import type { ICurrentUser } from '../auth/types/user.types';
import {
  getPaginationParams,
  paginationMetadata,
} from 'common/helpers/pagination.helpers';
import { DAY_MS, toDateOnly } from 'common/helpers/date.helpers';
import { CreateItineraryDto } from './dto/create-itinerary.dto';
import { UpdateItineraryDto } from './dto/update-itinerary.dto';
import { AddHotelDto } from './dto/add-hotel.dto';
import { AddFlightDto } from './dto/add-flight.dto';
import { ItineraryQueryParams } from './types/itinerary-query.types';

type Db = PrismaService | Prisma.TransactionClient;

const MAX_TX_ATTEMPTS = 3;

const nightsBetween = (checkIn: Date, checkOut: Date) =>
  Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);

// Postgres serialization failures (40001) surface as P2034 from the query
// engine, but as a DriverAdapterError when they happen at commit via adapter-pg.
const isWriteConflict = (err: unknown) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError)
    return err.code === 'P2034';

  const cause = (err as { cause?: { kind?: string; originalCode?: string } })
    ?.cause;
  return (
    cause?.kind === 'TransactionWriteConflict' ||
    cause?.originalCode === '40001'
  );
};

const DETAIL_INCLUDE = {
  destination: true,
  itineraryHotel: {
    include: { hotel: true },
    orderBy: { checkInDate: 'asc' },
  },
  itineraryFlight: {
    include: {
      flight: { include: { departureAirport: true, arrivalAirport: true } },
    },
    orderBy: { flight: { departureAt: 'asc' } },
  },
} satisfies Prisma.ItineraryInclude;

@Injectable()
export class ItinerariesService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  async create(dto: CreateItineraryDto, currentUser: ICurrentUser) {
    const startDate = toDateOnly(dto.startDate);
    const endDate = toDateOnly(dto.endDate);
    this.validateTripDates(startDate, endDate);

    const destination = await this.prisma.destination.findUnique({
      where: { id: dto.destinationId },
    });
    if (!destination) throw new NotFoundException('Destination not found');

    const itinerary = await this.prisma.itinerary.create({
      data: {
        name: dto.name,
        destinationId: dto.destinationId,
        userId: currentUser.id,
        startDate,
        endDate,
      },
      include: DETAIL_INCLUDE,
    });

    return this.withTotals(itinerary);
  }

  async findAll(currentUser: ICurrentUser, query: ItineraryQueryParams) {
    const { skip, l: limit } = getPaginationParams(query.page, query.limit);
    const where = { userId: currentUser.id, status: query.status };
    const [itineraries, total] = await this.prisma.$transaction([
      this.prisma.itinerary.findMany({
        where,
        include: { destination: true },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        take: limit,
        skip,
      }),
      this.prisma.itinerary.count({ where }),
    ]);

    return { itineraries, pagination: paginationMetadata(skip, limit, total) };
  }

  async findOne(id: string, currentUser: ICurrentUser) {
    await this.getOwnedOrFail(id, currentUser);
    const itinerary = await this.prisma.itinerary.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    return this.withTotals(itinerary);
  }

  async update(id: string, currentUser: ICurrentUser, dto: UpdateItineraryDto) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(itinerary, ItineraryStatus.DRAFT);

    const startDate = dto.startDate
      ? toDateOnly(dto.startDate)
      : itinerary.startDate;
    const endDate = dto.endDate ? toDateOnly(dto.endDate) : itinerary.endDate;
    this.validateTripDates(startDate, endDate);

    const [stays, flights] = await Promise.all([
      this.prisma.itineraryHotel.findMany({ where: { itineraryId: id } }),
      this.prisma.itineraryFlight.findMany({
        where: { itineraryId: id },
        include: { flight: true },
      }),
    ]);
    const range = { startDate, endDate };
    const outOfRange =
      stays.some((s) => !this.stayFits(range, s.checkInDate, s.checkOutDate)) ||
      flights.some((f) => !this.flightFits(range, f.flight.departureAt));
    if (outOfRange)
      throw new BadRequestException(
        'New dates would leave existing hotel stays or flights outside the trip',
      );

    await this.prisma.itinerary.update({
      where: { id },
      data: { name: dto.name, startDate, endDate },
    });

    return this.findOne(id, currentUser);
  }

  async remove(id: string, currentUser: ICurrentUser) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(
      itinerary,
      ItineraryStatus.DRAFT,
      ItineraryStatus.CANCELLED,
    );

    return this.prisma.itinerary.delete({ where: { id } });
  }

  async addHotel(id: string, currentUser: ICurrentUser, dto: AddHotelDto) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(itinerary, ItineraryStatus.DRAFT);

    const hotel = await this.prisma.hotel.findUnique({
      where: { id: dto.hotelId },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    if (hotel.destinationId !== itinerary.destinationId)
      throw new BadRequestException(
        "Hotel is not in this itinerary's destination",
      );

    const checkIn = toDateOnly(dto.checkInDate);
    const checkOut = toDateOnly(dto.checkOutDate);
    if (checkOut <= checkIn)
      throw new BadRequestException('checkOutDate must be after checkInDate');
    if (!this.stayFits(itinerary, checkIn, checkOut))
      throw new BadRequestException('Stay must fall within the trip dates');

    const available = await this.inventory.availableHotelRooms(
      hotel.id,
      checkIn,
      checkOut,
    );
    if (dto.rooms > available)
      throw new ConflictException(
        `Only ${available} room(s) available at ${hotel.name} for those dates`,
      );

    const nights = nightsBetween(checkIn, checkOut);
    await this.prisma.itineraryHotel.create({
      data: {
        itineraryId: id,
        hotelId: hotel.id,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        rooms: dto.rooms,
        nightlyRate: hotel.nightlyRate,
        totalPrice: hotel.nightlyRate.mul(nights * dto.rooms),
        currency: hotel.currency,
      },
    });

    return this.findOne(id, currentUser);
  }

  async removeHotel(id: string, itemId: string, currentUser: ICurrentUser) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(itinerary, ItineraryStatus.DRAFT);

    const { count } = await this.prisma.itineraryHotel.deleteMany({
      where: { id: itemId, itineraryId: id },
    });
    if (!count) throw new NotFoundException('Hotel stay not found');

    return this.findOne(id, currentUser);
  }

  async addFlight(id: string, currentUser: ICurrentUser, dto: AddFlightDto) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(itinerary, ItineraryStatus.DRAFT);

    const flight = await this.prisma.flight.findUnique({
      where: { id: dto.flightId },
    });
    if (!flight) throw new NotFoundException('Flight not found');
    if (flight.departureAt <= new Date())
      throw new BadRequestException('Flight has already departed');
    if (!this.flightFits(itinerary, flight.departureAt))
      throw new BadRequestException('Flight must depart within the trip dates');
    if (dto.passengers > flight.availableSeats)
      throw new ConflictException(
        `Only ${flight.availableSeats} seat(s) left on flight ${flight.flightNumber}`,
      );

    await this.prisma.itineraryFlight.create({
      data: {
        itineraryId: id,
        flightId: flight.id,
        passengers: dto.passengers,
        unitPrice: flight.price,
        totalPrice: flight.price.mul(dto.passengers),
        currency: flight.currency,
      },
    });

    return this.findOne(id, currentUser);
  }

  async removeFlight(id: string, itemId: string, currentUser: ICurrentUser) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(itinerary, ItineraryStatus.DRAFT);

    const { count } = await this.prisma.itineraryFlight.deleteMany({
      where: { id: itemId, itineraryId: id },
    });
    if (!count) throw new NotFoundException('Flight booking not found');

    return this.findOne(id, currentUser);
  }

  // Reserves every hotel stay and flight at once, or nothing at all.
  async confirm(id: string, currentUser: ICurrentUser) {
    await this.inSerializableTx(async (tx) => {
      const itinerary = await this.getOwnedOrFail(id, currentUser, tx);
      this.assertStatus(itinerary, ItineraryStatus.DRAFT);

      const stays = await tx.itineraryHotel.findMany({
        where: { itineraryId: id },
        include: { hotel: true },
      });
      const flights = await tx.itineraryFlight.findMany({
        where: { itineraryId: id },
        include: { flight: true },
      });
      if (!stays.length && !flights.length)
        throw new BadRequestException(
          'Add at least one hotel stay or flight before confirming',
        );

      // Each stay is marked CONFIRMED before the next is checked, so two stays
      // at the same hotel in one itinerary count against each other.
      for (const stay of stays) {
        const available = await this.inventory.availableHotelRooms(
          stay.hotelId,
          stay.checkInDate,
          stay.checkOutDate,
          tx,
        );
        if (stay.rooms > available)
          throw new ConflictException(
            `Only ${available} room(s) left at ${stay.hotel.name} for those dates`,
          );

        const nights = nightsBetween(stay.checkInDate, stay.checkOutDate);
        await tx.itineraryHotel.update({
          where: { id: stay.id },
          data: {
            status: BookingStatus.CONFIRMED,
            nightlyRate: stay.hotel.nightlyRate,
            totalPrice: stay.hotel.nightlyRate.mul(nights * stay.rooms),
            currency: stay.hotel.currency,
          },
        });
      }

      for (const item of flights) {
        if (item.flight.departureAt <= new Date())
          throw new BadRequestException(
            `Flight ${item.flight.flightNumber} has already departed`,
          );

        const reserved = await this.inventory.reserveFlightSeats(
          item.flightId,
          item.passengers,
          tx,
        );
        if (!reserved)
          throw new ConflictException(
            `Not enough seats left on flight ${item.flight.flightNumber}`,
          );

        await tx.itineraryFlight.update({
          where: { id: item.id },
          data: {
            status: BookingStatus.CONFIRMED,
            unitPrice: item.flight.price,
            totalPrice: item.flight.price.mul(item.passengers),
            currency: item.flight.currency,
          },
        });
      }

      await tx.itinerary.update({
        where: { id },
        data: { status: ItineraryStatus.PLANNED },
      });
    });

    return this.findOne(id, currentUser);
  }

  // Releases flight seats; hotel rooms free up because only CONFIRMED stays
  // count towards availability.
  async cancel(id: string, currentUser: ICurrentUser) {
    await this.inSerializableTx(async (tx) => {
      const itinerary = await this.getOwnedOrFail(id, currentUser, tx);
      this.assertStatus(itinerary, ItineraryStatus.PLANNED);

      const flights = await tx.itineraryFlight.findMany({
        where: { itineraryId: id, status: BookingStatus.CONFIRMED },
      });
      for (const item of flights) {
        await this.inventory.releaseFlightSeats(
          item.flightId,
          item.passengers,
          tx,
        );
      }

      await tx.itineraryHotel.updateMany({
        where: { itineraryId: id },
        data: { status: BookingStatus.CANCELLED },
      });
      await tx.itineraryFlight.updateMany({
        where: { itineraryId: id },
        data: { status: BookingStatus.CANCELLED },
      });
      await tx.itinerary.update({
        where: { id },
        data: { status: ItineraryStatus.CANCELLED },
      });
    });

    return this.findOne(id, currentUser);
  }

  // Other users' itineraries are reported as missing rather than forbidden,
  // so their existence isn't leaked.
  private async getOwnedOrFail(
    id: string,
    currentUser: ICurrentUser,
    db: Db = this.prisma,
  ) {
    const itinerary = await db.itinerary.findUnique({ where: { id } });
    if (
      !itinerary ||
      (itinerary.userId !== currentUser.id && currentUser.role !== Role.ADMIN)
    )
      throw new NotFoundException('Itinerary not found');

    return itinerary;
  }

  private assertStatus(itinerary: Itinerary, ...allowed: ItineraryStatus[]) {
    if (!allowed.includes(itinerary.status))
      throw new ConflictException(
        `Itinerary is ${itinerary.status}; this action requires ${allowed.join(' or ')}`,
      );
  }

  private validateTripDates(startDate: Date, endDate: Date) {
    if (endDate < startDate)
      throw new BadRequestException('endDate cannot be before startDate');
    if (startDate < toDateOnly(new Date()))
      throw new BadRequestException('startDate cannot be in the past');
  }

  private stayFits(
    trip: Pick<Itinerary, 'startDate' | 'endDate'>,
    checkIn: Date,
    checkOut: Date,
  ) {
    return checkIn >= trip.startDate && checkOut <= trip.endDate;
  }

  // endDate is a calendar day, so flights any time on that day still fit.
  private flightFits(
    trip: Pick<Itinerary, 'startDate' | 'endDate'>,
    departureAt: Date,
  ) {
    return (
      departureAt >= trip.startDate &&
      departureAt.getTime() < trip.endDate.getTime() + DAY_MS
    );
  }

  // Serializable isolation makes concurrent confirmations of the same rooms or
  // seats fail with a write conflict instead of overbooking; those are retried.
  private async inSerializableTx<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (err) {
        if (!isWriteConflict(err)) throw err;
        if (attempt >= MAX_TX_ATTEMPTS)
          throw new ConflictException(
            'Booking conflicted with another request, please retry',
          );
      }
    }
  }

  private withTotals<
    T extends {
      itineraryHotel: {
        status: BookingStatus;
        currency: string;
        totalPrice: Prisma.Decimal;
      }[];
      itineraryFlight: {
        status: BookingStatus;
        currency: string;
        totalPrice: Prisma.Decimal;
      }[];
    },
  >(itinerary: T) {
    const totals: Record<string, Prisma.Decimal> = {};
    for (const item of [
      ...itinerary.itineraryHotel,
      ...itinerary.itineraryFlight,
    ]) {
      if (item.status === BookingStatus.CANCELLED) continue;
      totals[item.currency] = (
        totals[item.currency] ?? new Prisma.Decimal(0)
      ).add(item.totalPrice);
    }

    return { ...itinerary, totals };
  }
}
