import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma } from '../../generated/prisma/client';

type Db = PrismaService | Prisma.TransactionClient;

// Single place that answers "is there room?" and holds/releases inventory.
// Today it is backed by our own tables; external providers (Amadeus, Duffel…)
// can later implement the same methods.
@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // Peak number of rooms held by CONFIRMED stays on any night in
  // [checkIn, checkOut). Stays are swept as +rooms / -rooms events so that
  // two bookings that overlap the range but not each other aren't summed.
  async bookedHotelRooms(
    hotelId: string,
    checkIn: Date,
    checkOut: Date,
    db: Db = this.prisma,
  ) {
    const stays = await db.itineraryHotel.findMany({
      where: {
        hotelId,
        status: BookingStatus.CONFIRMED,
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      select: { checkInDate: true, checkOutDate: true, rooms: true },
    });

    const events = stays.flatMap((s) => [
      {
        at: Math.max(s.checkInDate.getTime(), checkIn.getTime()),
        delta: s.rooms,
      },
      { at: s.checkOutDate.getTime(), delta: -s.rooms },
    ]);
    // Checkouts free rooms before same-day check-ins take them.
    events.sort((a, b) => a.at - b.at || a.delta - b.delta);

    let current = 0;
    let peak = 0;
    for (const e of events) {
      current += e.delta;
      peak = Math.max(peak, current);
    }

    return peak;
  }

  async availableHotelRooms(
    hotelId: string,
    checkIn: Date,
    checkOut: Date,
    db: Db = this.prisma,
  ) {
    const hotel = await db.hotel.findUnique({
      where: { id: hotelId },
      select: { totalRooms: true },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    const booked = await this.bookedHotelRooms(hotelId, checkIn, checkOut, db);

    return hotel.totalRooms - booked;
  }

  // Atomically takes seats only if enough are left. Returns false otherwise.
  async reserveFlightSeats(
    flightId: string,
    seats: number,
    db: Db = this.prisma,
  ) {
    const { count } = await db.flight.updateMany({
      where: { id: flightId, availableSeats: { gte: seats } },
      data: { availableSeats: { decrement: seats } },
    });

    return count === 1;
  }

  async releaseFlightSeats(
    flightId: string,
    seats: number,
    db: Db = this.prisma,
  ) {
    await db.flight.update({
      where: { id: flightId },
      data: { availableSeats: { increment: seats } },
    });
  }
}
