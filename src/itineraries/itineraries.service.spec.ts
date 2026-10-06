import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ItinerariesService } from './itineraries.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { Prisma } from '../../generated/prisma/client';
import { Role } from '../auth/types/auth.types';
import type { ICurrentUser } from '../auth/types/user.types';

const alice: ICurrentUser = { id: 'alice', email: 'a@t.io', role: Role.USER };
const bob: ICurrentUser = { id: 'bob', email: 'b@t.io', role: Role.USER };
const admin: ICurrentUser = { id: 'root', email: 'r@t.io', role: Role.ADMIN };

const draft = {
  id: 'trip',
  userId: 'alice',
  destinationId: 'kigali',
  status: 'DRAFT',
  startDate: new Date('2030-01-01T00:00:00Z'),
  endDate: new Date('2030-01-10T00:00:00Z'),
};
const detail = { ...draft, itineraryHotel: [], itineraryFlight: [] };

const writeConflict = () =>
  Object.assign(new Error('could not serialize access'), {
    cause: { kind: 'TransactionWriteConflict', originalCode: '40001' },
  });

describe('ItinerariesService', () => {
  let prisma: {
    $transaction: jest.Mock;
    itinerary: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    hotel: { findUnique: jest.Mock };
    itineraryHotel: { create: jest.Mock };
  };
  let inventory: { availableHotelRooms: jest.Mock };
  let service: ItinerariesService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockResolvedValue(undefined),
      itinerary: {
        findUnique: jest.fn().mockResolvedValue(draft),
        findUniqueOrThrow: jest.fn().mockResolvedValue(detail),
      },
      hotel: { findUnique: jest.fn() },
      itineraryHotel: { create: jest.fn() },
    };
    inventory = { availableHotelRooms: jest.fn().mockResolvedValue(10) };
    service = new ItinerariesService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
    );
  });

  describe('ownership', () => {
    it("reports another user's itinerary as not found", async () => {
      await expect(service.findOne('trip', bob)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lets the owner and admins read it', async () => {
      await expect(service.findOne('trip', alice)).resolves.toMatchObject({
        id: 'trip',
        totals: {},
      });
      await expect(service.findOne('trip', admin)).resolves.toMatchObject({
        id: 'trip',
      });
    });
  });

  describe('confirm retries', () => {
    it('retries serialization conflicts from the pg adapter', async () => {
      prisma.$transaction
        .mockRejectedValueOnce(writeConflict())
        .mockResolvedValueOnce(undefined);

      await service.confirm('trip', alice);

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('retries P2034 from the query engine', async () => {
      prisma.$transaction
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('conflict', {
            code: 'P2034',
            clientVersion: '7',
          }),
        )
        .mockResolvedValueOnce(undefined);

      await service.confirm('trip', alice);

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('gives up with 409 after repeated conflicts', async () => {
      prisma.$transaction.mockRejectedValue(writeConflict());

      await expect(service.confirm('trip', alice)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('does not retry other errors', async () => {
      const boom = new Error('boom');
      prisma.$transaction.mockRejectedValue(boom);

      await expect(service.confirm('trip', alice)).rejects.toBe(boom);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('addHotel', () => {
    const hotel = {
      id: 'hill-view',
      name: 'Hill View',
      destinationId: 'kigali',
      nightlyRate: new Prisma.Decimal(120),
      currency: 'USD',
    };
    const stay = {
      hotelId: 'hill-view',
      checkInDate: new Date('2030-01-02T15:00:00Z'),
      checkOutDate: new Date('2030-01-05T09:00:00Z'),
      rooms: 2,
    };

    it('snapshots nights x rooms x rate on calendar days', async () => {
      prisma.hotel.findUnique.mockResolvedValue(hotel);

      await service.addHotel('trip', alice, stay);

      const [{ data }] = prisma.itineraryHotel.create.mock.calls[0] as [
        {
          data: {
            checkInDate: Date;
            checkOutDate: Date;
            totalPrice: Prisma.Decimal;
            currency: string;
          };
        },
      ];
      expect(data.checkInDate).toEqual(new Date('2030-01-02T00:00:00Z'));
      expect(data.checkOutDate).toEqual(new Date('2030-01-05T00:00:00Z'));
      expect(data.totalPrice.toNumber()).toBe(3 * 2 * 120);
      expect(data.currency).toBe('USD');
    });

    it('rejects hotels in another destination', async () => {
      prisma.hotel.findUnique.mockResolvedValue({
        ...hotel,
        destinationId: 'nairobi',
      });

      await expect(
        service.addHotel('trip', alice, stay),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects stays when not enough rooms are free', async () => {
      prisma.hotel.findUnique.mockResolvedValue(hotel);
      inventory.availableHotelRooms.mockResolvedValue(1);

      await expect(
        service.addHotel('trip', alice, stay),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.itineraryHotel.create).not.toHaveBeenCalled();
    });

    it('refuses to change a planned itinerary', async () => {
      prisma.itinerary.findUnique.mockResolvedValue({
        ...draft,
        status: 'PLANNED',
      });

      await expect(
        service.addHotel('trip', alice, stay),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
