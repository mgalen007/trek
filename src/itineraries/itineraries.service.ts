import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { TravelersService } from '../travelers/travelers.service';
import {
  BookingStatus,
  ItineraryEventType,
  ItineraryStatus,
  Prisma,
} from '../../generated/prisma/client';
import type { Itinerary } from '../../generated/prisma/client';
import { Role } from '../auth/types/auth.types';
import type { ICurrentUser } from '../auth/types/user.types';
import { getPaginationParams } from 'common/helpers/pagination.helpers';
import { toPage } from 'common/http/page';
import { apiError, ErrorCode } from 'common/http/api-error';
import { DAY_MS, toDateOnly } from 'common/helpers/date.helpers';
import { CreateItineraryDto } from './dto/create-itinerary.dto';
import { UpdateItineraryDto } from './dto/update-itinerary.dto';
import { AddHotelDto } from './dto/add-hotel.dto';
import { AddFlightDto } from './dto/add-flight.dto';
import { ConfirmItineraryDto } from './dto/confirm-itinerary.dto';
import type {
  QuoteFlightEntity,
  QuoteHotelStayEntity,
} from './entities/itinerary-quote.entity';
import {
  ItineraryEventQueryParams,
  ItineraryQueryParams,
} from './types/itinerary-query.types';
import {
  eventData,
  flightDetails,
  recordEvent,
  stayDetails,
  totalsByCurrency,
  tripChanges,
  tripDetails,
} from './itinerary-events';
import { randomUUID } from 'crypto';
import { queueEmail } from '../email/email-outbox';
import {
  FlightLine,
  itineraryCancelledEmail,
  itineraryConfirmedEmail,
  StayLine,
  tripSummary,
} from '../email/templates';

const day = (date: Date) => date.toISOString().slice(0, 10);

type Db = PrismaService | Prisma.TransactionClient;

const MAX_TX_ATTEMPTS = 3;

const nightsBetween = (checkIn: Date, checkOut: Date) =>
  Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);

// Same currencies and amounts, compared as decimals ("300" equals "300.00").
const sameTotals = (
  expected: Record<string, string>,
  current: Record<string, string>,
) => {
  const currencies = Object.keys(current);
  return (
    currencies.length === Object.keys(expected).length &&
    currencies.every(
      (currency) =>
        expected[currency] !== undefined &&
        new Prisma.Decimal(expected[currency]).equals(current[currency]),
    )
  );
};

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
      travelers: { orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
    },
    orderBy: { flight: { departureAt: 'asc' } },
  },
} satisfies Prisma.ItineraryInclude;

@Injectable()
export class ItinerariesService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private travelers: TravelersService,
  ) {}

  async create(dto: CreateItineraryDto, currentUser: ICurrentUser) {
    const startDate = toDateOnly(dto.startDate);
    const endDate = toDateOnly(dto.endDate);
    this.validateTripDates(startDate, endDate);

    const destination = await this.prisma.destination.findUnique({
      where: { id: dto.destinationId },
    });
    if (!destination) throw new NotFoundException('Destination not found');

    const trip = {
      name: dto.name,
      destinationId: dto.destinationId,
      startDate,
      endDate,
    };
    const itinerary = await this.prisma.itinerary.create({
      data: {
        ...trip,
        userId: currentUser.id,
        events: {
          create: eventData(
            currentUser,
            ItineraryEventType.CREATED,
            tripDetails(trip),
          ),
        },
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

    return toPage(itineraries, skip, limit, total);
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

    const changes = tripChanges(itinerary, {
      name: dto.name,
      startDate,
      endDate,
    });
    // Saving without changes isn't a change: no event, no new version.
    if (Object.keys(changes).length)
      await this.prisma.$transaction(async (tx) => {
        await this.touchDraft(tx, id);
        await tx.itinerary.update({
          where: { id },
          data: { name: dto.name, startDate, endDate },
        });
        await recordEvent(tx, id, currentUser, ItineraryEventType.UPDATED, {
          changes,
        });
      });

    return this.findOne(id, currentUser);
  }

  // Newest first.
  async findEvents(
    id: string,
    currentUser: ICurrentUser,
    query: ItineraryEventQueryParams,
  ) {
    await this.getOwnedOrFail(id, currentUser);
    const { skip, l: limit } = getPaginationParams(query.page, query.limit);
    const where = { itineraryId: id, type: query.type };
    const [events, total] = await this.prisma.$transaction([
      this.prisma.itineraryEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip,
      }),
      this.prisma.itineraryEvent.count({ where }),
    ]);

    return toPage(events, skip, limit, total);
  }

  async remove(id: string, currentUser: ICurrentUser) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(
      itinerary,
      ItineraryStatus.DRAFT,
      ItineraryStatus.CANCELLED,
    );
    // Cancelled trips are booking history; only the user may remove them.
    if (currentUser.agent && itinerary.status !== ItineraryStatus.DRAFT)
      throw new ForbiddenException(
        apiError(
          ErrorCode.AGENT_NOT_ALLOWED,
          'The assistant can only delete draft itineraries',
        ),
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
        apiError(
          ErrorCode.ROOMS_UNAVAILABLE,
          `Only ${available} room(s) available at ${hotel.name} for those dates`,
        ),
      );

    const nights = nightsBetween(checkIn, checkOut);
    const stay = {
      id: randomUUID(),
      itineraryId: id,
      hotelId: hotel.id,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      rooms: dto.rooms,
      nightlyRate: hotel.nightlyRate,
      totalPrice: hotel.nightlyRate.mul(nights * dto.rooms),
      currency: hotel.currency,
    };
    await this.prisma.$transaction(async (tx) => {
      await this.touchDraft(tx, id);
      await tx.itineraryHotel.create({ data: stay });
      await recordEvent(
        tx,
        id,
        currentUser,
        ItineraryEventType.HOTEL_ADDED,
        stayDetails(stay, hotel.name),
      );
    });

    return this.findOne(id, currentUser);
  }

  async removeHotel(id: string, itemId: string, currentUser: ICurrentUser) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(itinerary, ItineraryStatus.DRAFT);

    const stay = await this.prisma.itineraryHotel.findFirst({
      where: { id: itemId, itineraryId: id },
      include: { hotel: { select: { name: true } } },
    });
    if (!stay) throw new NotFoundException('Hotel stay not found');

    await this.prisma.$transaction(async (tx) => {
      await this.touchDraft(tx, id);
      await tx.itineraryHotel.delete({ where: { id: itemId } });
      await recordEvent(
        tx,
        id,
        currentUser,
        ItineraryEventType.HOTEL_REMOVED,
        stayDetails(stay, stay.hotel.name),
      );
    });

    return this.findOne(id, currentUser);
  }

  async addFlight(id: string, currentUser: ICurrentUser, dto: AddFlightDto) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(itinerary, ItineraryStatus.DRAFT);

    const travelerIds = dto.travelerIds ?? [];
    const passengers = dto.passengers ?? travelerIds.length;
    if (!passengers)
      throw new BadRequestException('Give passengers or travelerIds');
    if (travelerIds.length && passengers !== travelerIds.length)
      throw new BadRequestException(
        `passengers (${passengers}) must match the number of travelerIds (${travelerIds.length})`,
      );
    // Travelers belong to the itinerary's owner, even when an admin books.
    if (travelerIds.length)
      await this.travelers.assertOwnedBy(itinerary.userId, travelerIds);

    const flight = await this.prisma.flight.findUnique({
      where: { id: dto.flightId },
    });
    if (!flight) throw new NotFoundException('Flight not found');
    if (flight.departureAt <= new Date())
      throw new BadRequestException('Flight has already departed');
    if (!this.flightFits(itinerary, flight.departureAt))
      throw new BadRequestException('Flight must depart within the trip dates');
    if (passengers > flight.availableSeats)
      throw new ConflictException(
        apiError(
          ErrorCode.SEATS_UNAVAILABLE,
          `Only ${flight.availableSeats} seat(s) left on flight ${flight.flightNumber}`,
        ),
      );

    const item = {
      id: randomUUID(),
      itineraryId: id,
      flightId: flight.id,
      passengers,
      unitPrice: flight.price,
      totalPrice: flight.price.mul(passengers),
      currency: flight.currency,
    };
    await this.prisma.$transaction(async (tx) => {
      await this.touchDraft(tx, id);
      await tx.itineraryFlight.create({
        data: {
          ...item,
          travelers: {
            connect: travelerIds.map((travelerId) => ({ id: travelerId })),
          },
        },
      });
      await recordEvent(
        tx,
        id,
        currentUser,
        ItineraryEventType.FLIGHT_ADDED,
        flightDetails(item, flight),
      );
    });

    return this.findOne(id, currentUser);
  }

  async removeFlight(id: string, itemId: string, currentUser: ICurrentUser) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    this.assertStatus(itinerary, ItineraryStatus.DRAFT);

    const item = await this.prisma.itineraryFlight.findFirst({
      where: { id: itemId, itineraryId: id },
      include: {
        flight: { select: { flightNumber: true, departureAt: true } },
      },
    });
    if (!item) throw new NotFoundException('Flight booking not found');

    await this.prisma.$transaction(async (tx) => {
      await this.touchDraft(tx, id);
      await tx.itineraryFlight.delete({ where: { id: itemId } });
      await recordEvent(
        tx,
        id,
        currentUser,
        ItineraryEventType.FLIGHT_REMOVED,
        flightDetails(item, item.flight),
      );
    });

    return this.findOne(id, currentUser);
  }

  /**
   * What confirming would do right now: each item at current prices, the
   * totals to send back as expectedTotals, the version to send as
   * expectedVersion, and anything that would make confirm fail. Reserves
   * nothing.
   */
  async quote(id: string, currentUser: ICurrentUser) {
    const itinerary = await this.getOwnedOrFail(id, currentUser);
    const items = await this.loadItems(this.prisma, id);
    const priced = this.priceItems(items);
    const issues: { code: ErrorCode; itemId?: string; message: string }[] = [];
    const isDraft = itinerary.status === ItineraryStatus.DRAFT;

    if (!isDraft)
      issues.push({
        code: ErrorCode.INVALID_STATUS,
        message: `Itinerary is ${itinerary.status}; only drafts can be confirmed`,
      });
    if (!items.stays.length && !items.flights.length)
      issues.push({
        code: ErrorCode.BAD_REQUEST,
        message: 'Add at least one hotel stay or flight before confirming',
      });

    const hotelStays: QuoteHotelStayEntity[] = [];
    for (const { stay, nightlyRate, totalPrice, currency } of priced.stays) {
      // Checked one by one: two stays of this trip at the same hotel can
      // still conflict with each other at confirm.
      const available = isDraft
        ? await this.inventory.availableHotelRooms(
            stay.hotelId,
            stay.checkInDate,
            stay.checkOutDate,
          )
        : stay.rooms;
      if (stay.rooms > available)
        issues.push({
          code: ErrorCode.ROOMS_UNAVAILABLE,
          itemId: stay.id,
          message: `Only ${available} room(s) left at ${stay.hotel.name} for those dates`,
        });
      hotelStays.push({
        itemId: stay.id,
        hotelId: stay.hotelId,
        hotelName: stay.hotel.name,
        checkInDate: day(stay.checkInDate),
        checkOutDate: day(stay.checkOutDate),
        rooms: stay.rooms,
        nightlyRate: nightlyRate.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        currency,
        priceChanged: !totalPrice.equals(stay.totalPrice),
      });
    }

    const flights: QuoteFlightEntity[] = [];
    for (const { item, unitPrice, totalPrice, currency } of priced.flights) {
      if (isDraft && item.flight.departureAt <= new Date())
        issues.push({
          code: ErrorCode.BAD_REQUEST,
          itemId: item.id,
          message: `Flight ${item.flight.flightNumber} has already departed`,
        });
      else if (isDraft && item.passengers > item.flight.availableSeats)
        issues.push({
          code: ErrorCode.SEATS_UNAVAILABLE,
          itemId: item.id,
          message: `Only ${item.flight.availableSeats} seat(s) left on flight ${item.flight.flightNumber}`,
        });
      flights.push({
        itemId: item.id,
        flightId: item.flightId,
        flightNumber: item.flight.flightNumber,
        airline: item.flight.airline,
        departureAt: item.flight.departureAt,
        passengers: item.passengers,
        unitPrice: unitPrice.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        currency,
        priceChanged: !totalPrice.equals(item.totalPrice),
      });
    }

    return {
      itineraryId: id,
      status: itinerary.status,
      version: itinerary.version,
      bookable: issues.length === 0,
      totals: priced.totals,
      hotelStays,
      flights,
      issues,
    };
  }

  // Reserves every hotel stay and flight at once, or nothing at all, and
  // only if the trip is still the version and price the user reviewed.
  async confirm(
    id: string,
    currentUser: ICurrentUser,
    expected: ConfirmItineraryDto,
  ) {
    await this.inSerializableTx(async (tx) => {
      const itinerary = await this.getOwnedOrFail(id, currentUser, tx);
      this.assertStatus(itinerary, ItineraryStatus.DRAFT);
      if (itinerary.version !== expected.expectedVersion)
        throw new ConflictException(
          apiError(
            ErrorCode.ITINERARY_CHANGED,
            `Itinerary changed since version ${expected.expectedVersion} (now ${itinerary.version}); review it again`,
            {
              expectedVersion: expected.expectedVersion,
              currentVersion: itinerary.version,
            },
          ),
        );

      const items = await this.loadItems(tx, id);
      if (!items.stays.length && !items.flights.length)
        throw new BadRequestException(
          'Add at least one hotel stay or flight before confirming',
        );
      const priced = this.priceItems(items);
      if (!sameTotals(expected.expectedTotals, priced.totals))
        throw new ConflictException(
          apiError(
            ErrorCode.PRICE_CHANGED,
            'Prices changed since the quote; review the new total',
            {
              expectedTotals: expected.expectedTotals,
              currentTotals: priced.totals,
            },
          ),
        );

      // Each stay is marked CONFIRMED before the next is checked, so two stays
      // at the same hotel in one itinerary count against each other.
      for (const { stay, nightlyRate, totalPrice, currency } of priced.stays) {
        const available = await this.inventory.availableHotelRooms(
          stay.hotelId,
          stay.checkInDate,
          stay.checkOutDate,
          tx,
        );
        if (stay.rooms > available)
          throw new ConflictException(
            apiError(
              ErrorCode.ROOMS_UNAVAILABLE,
              `Only ${available} room(s) left at ${stay.hotel.name} for those dates`,
            ),
          );
        await tx.itineraryHotel.update({
          where: { id: stay.id },
          data: {
            status: BookingStatus.CONFIRMED,
            nightlyRate,
            totalPrice,
            currency,
          },
        });
      }

      for (const { item, unitPrice, totalPrice, currency } of priced.flights) {
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
            apiError(
              ErrorCode.SEATS_UNAVAILABLE,
              `Not enough seats left on flight ${item.flight.flightNumber}`,
            ),
          );
        await tx.itineraryFlight.update({
          where: { id: item.id },
          data: {
            status: BookingStatus.CONFIRMED,
            unitPrice,
            totalPrice,
            currency,
          },
        });
      }

      const stayLines: StayLine[] = priced.stays.map((s) => ({
        hotelName: s.stay.hotel.name,
        checkInDate: day(s.stay.checkInDate),
        checkOutDate: day(s.stay.checkOutDate),
        rooms: s.stay.rooms,
        totalPrice: s.totalPrice.toFixed(2),
        currency: s.currency,
      }));
      const flightLines: FlightLine[] = priced.flights.map((f) => ({
        flightNumber: f.item.flight.flightNumber,
        airline: f.item.flight.airline,
        departureAt: f.item.flight.departureAt.toISOString(),
        passengers: f.item.passengers,
        totalPrice: f.totalPrice.toFixed(2),
        currency: f.currency,
      }));
      const { totals } = priced;

      await tx.itinerary.update({
        where: { id },
        data: { status: ItineraryStatus.PLANNED, version: { increment: 1 } },
      });
      await recordEvent(tx, id, currentUser, ItineraryEventType.CONFIRMED, {
        hotelStays: items.stays.length,
        flights: items.flights.length,
        totals,
      });
      const { owner, trip } = await this.emailContext(tx, id);
      await queueEmail(
        tx,
        owner.id,
        owner.email,
        itineraryConfirmedEmail(
          owner.firstName,
          trip,
          stayLines,
          flightLines,
          totals,
        ),
      );
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

      const { count: hotelStays } = await tx.itineraryHotel.updateMany({
        where: { itineraryId: id },
        data: { status: BookingStatus.CANCELLED },
      });
      await tx.itineraryFlight.updateMany({
        where: { itineraryId: id },
        data: { status: BookingStatus.CANCELLED },
      });
      await tx.itinerary.update({
        where: { id },
        data: { status: ItineraryStatus.CANCELLED, version: { increment: 1 } },
      });
      await recordEvent(tx, id, currentUser, ItineraryEventType.CANCELLED, {
        hotelStays,
        flights: flights.length,
        releasedSeats: flights.reduce((sum, f) => sum + f.passengers, 0),
      });
      const { owner, trip } = await this.emailContext(tx, id);
      await queueEmail(
        tx,
        owner.id,
        owner.email,
        itineraryCancelledEmail(owner.firstName, trip),
      );
    });

    return this.findOne(id, currentUser);
  }

  // Every change to a draft goes through here, first thing in its
  // transaction: it bumps the version and re-checks DRAFT under the row
  // lock, so a change can't slip into a trip that was confirmed meanwhile.
  private async touchDraft(tx: Prisma.TransactionClient, id: string) {
    const { count } = await tx.itinerary.updateMany({
      where: { id, status: ItineraryStatus.DRAFT },
      data: { version: { increment: 1 } },
    });
    if (!count)
      throw new ConflictException(
        apiError(ErrorCode.INVALID_STATUS, 'Itinerary is no longer a DRAFT'),
      );
  }

  private async loadItems(db: Db, id: string) {
    const [stays, flights] = await Promise.all([
      db.itineraryHotel.findMany({
        where: { itineraryId: id },
        include: { hotel: true },
        orderBy: { checkInDate: 'asc' },
      }),
      db.itineraryFlight.findMany({
        where: { itineraryId: id },
        include: { flight: true },
        orderBy: { flight: { departureAt: 'asc' } },
      }),
    ]);
    return { stays, flights };
  }

  // Items at current catalogue prices: what confirm charges and quote shows.
  private priceItems({
    stays,
    flights,
  }: Awaited<ReturnType<ItinerariesService['loadItems']>>) {
    const pricedStays = stays.map((stay) => {
      const nights = nightsBetween(stay.checkInDate, stay.checkOutDate);
      return {
        stay,
        nightlyRate: stay.hotel.nightlyRate,
        totalPrice: stay.hotel.nightlyRate.mul(nights * stay.rooms),
        currency: stay.hotel.currency,
      };
    });
    const pricedFlights = flights.map((item) => ({
      item,
      unitPrice: item.flight.price,
      totalPrice: item.flight.price.mul(item.passengers),
      currency: item.flight.currency,
    }));
    return {
      stays: pricedStays,
      flights: pricedFlights,
      totals: totalsByCurrency([...pricedStays, ...pricedFlights]),
    };
  }

  // Emails go to the itinerary's owner, also when an admin acted for them.
  private async emailContext(tx: Prisma.TransactionClient, id: string) {
    const itinerary = await tx.itinerary.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true } },
        destination: { select: { name: true } },
      },
    });
    return { owner: itinerary.user, trip: tripSummary(itinerary) };
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
        apiError(
          ErrorCode.INVALID_STATUS,
          `Itinerary is ${itinerary.status}; this action requires ${allowed.join(' or ')}`,
        ),
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
            apiError(
              ErrorCode.BOOKING_CONFLICT,
              'Booking conflicted with another request, please retry',
            ),
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
