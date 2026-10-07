import { NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';

const d = (day: number) => new Date(Date.UTC(2030, 0, day));
const stay = (checkIn: number, checkOut: number, rooms: number) => ({
  checkInDate: d(checkIn),
  checkOutDate: d(checkOut),
  rooms,
});

describe('InventoryService', () => {
  let db: {
    itineraryHotel: { findMany: jest.Mock };
    hotel: { findUnique: jest.Mock };
    flight: { updateMany: jest.Mock; update: jest.Mock };
  };
  let service: InventoryService;

  beforeEach(() => {
    db = {
      itineraryHotel: { findMany: jest.fn().mockResolvedValue([]) },
      hotel: { findUnique: jest.fn() },
      flight: { updateMany: jest.fn(), update: jest.fn() },
    };
    service = new InventoryService(db as unknown as PrismaService);
  });

  describe('bookedHotelRooms', () => {
    it('is 0 with no confirmed stays', async () => {
      await expect(service.bookedHotelRooms('h', d(1), d(5))).resolves.toBe(0);
    });

    it('only queries confirmed stays overlapping the range', async () => {
      await service.bookedHotelRooms('h', d(1), d(5));

      expect(db.itineraryHotel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            hotelId: 'h',
            status: 'CONFIRMED',
            checkInDate: { lt: d(5) },
            checkOutDate: { gt: d(1) },
          },
        }),
      );
    });

    it('adds up stays that share a night', async () => {
      db.itineraryHotel.findMany.mockResolvedValue([
        stay(1, 4, 2),
        stay(2, 5, 1),
      ]);

      await expect(service.bookedHotelRooms('h', d(1), d(5))).resolves.toBe(3);
    });

    it("doesn't add up stays that overlap the range but not each other", async () => {
      db.itineraryHotel.findMany.mockResolvedValue([
        stay(1, 2, 2),
        stay(3, 5, 1),
      ]);

      await expect(service.bookedHotelRooms('h', d(1), d(5))).resolves.toBe(2);
    });

    it('frees rooms on checkout day before same-day check-ins', async () => {
      db.itineraryHotel.findMany.mockResolvedValue([
        stay(1, 3, 2),
        stay(3, 5, 2),
      ]);

      await expect(service.bookedHotelRooms('h', d(1), d(5))).resolves.toBe(2);
    });

    it('counts stays that began before the range', async () => {
      db.itineraryHotel.findMany.mockResolvedValue([stay(1, 4, 1)]);

      await expect(service.bookedHotelRooms('h', d(3), d(6))).resolves.toBe(1);
    });
  });

  describe('availableHotelRooms', () => {
    it('subtracts the peak booking from total rooms', async () => {
      db.hotel.findUnique.mockResolvedValue({ totalRooms: 5 });
      db.itineraryHotel.findMany.mockResolvedValue([
        stay(1, 4, 2),
        stay(2, 5, 1),
      ]);

      await expect(service.availableHotelRooms('h', d(1), d(5))).resolves.toBe(
        2,
      );
    });

    it('throws when the hotel does not exist', async () => {
      db.hotel.findUnique.mockResolvedValue(null);

      await expect(
        service.availableHotelRooms('missing', d(1), d(5)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reserveFlightSeats', () => {
    it('decrements only when enough seats are left', async () => {
      db.flight.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.reserveFlightSeats('f', 2)).resolves.toBe(true);
      expect(db.flight.updateMany).toHaveBeenCalledWith({
        where: { id: 'f', availableSeats: { gte: 2 } },
        data: { availableSeats: { decrement: 2 } },
      });
    });

    it('reports failure when the flight is full', async () => {
      db.flight.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reserveFlightSeats('f', 2)).resolves.toBe(false);
    });
  });

  it('releaseFlightSeats gives seats back', async () => {
    await service.releaseFlightSeats('f', 3);

    expect(db.flight.update).toHaveBeenCalledWith({
      where: { id: 'f' },
      data: { availableSeats: { increment: 3 } },
    });
  });
});
