import { ItineraryEventType, Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ICurrentUser } from '../auth/types/user.types';

type Db = PrismaService | Prisma.TransactionClient;

const day = (date: Date) => date.toISOString().slice(0, 10);

/** Event fields for a nested `events: { create }` or `recordEvent()`. */
export const eventData = (
  actor: ICurrentUser,
  type: ItineraryEventType,
  details?: Prisma.InputJsonObject,
) => ({ type, actorId: actor.id, actorRole: actor.role, details });

// Returns the query unawaited so it can join a batch $transaction.
export const recordEvent = (
  db: Db,
  itineraryId: string,
  actor: ICurrentUser,
  type: ItineraryEventType,
  details?: Prisma.InputJsonObject,
) =>
  db.itineraryEvent.create({
    data: { itineraryId, ...eventData(actor, type, details) },
  });

// Details are copied, not linked, so the history still reads correctly after
// an item is removed or the catalogue changes.

export const tripDetails = (trip: {
  name: string;
  destinationId: string;
  startDate: Date;
  endDate: Date;
}) => ({
  name: trip.name,
  destinationId: trip.destinationId,
  startDate: day(trip.startDate),
  endDate: day(trip.endDate),
});

/** `{ field: { from, to } }` for the fields an update actually changed. */
export const tripChanges = (
  before: { name: string; startDate: Date; endDate: Date },
  after: { name?: string; startDate: Date; endDate: Date },
) => {
  const changes: Record<string, { from: string; to: string }> = {};
  if (after.name !== undefined && after.name !== before.name)
    changes.name = { from: before.name, to: after.name };
  for (const field of ['startDate', 'endDate'] as const)
    if (after[field].getTime() !== before[field].getTime())
      changes[field] = { from: day(before[field]), to: day(after[field]) };
  return changes;
};

export const stayDetails = (
  stay: {
    id: string;
    hotelId: string;
    checkInDate: Date;
    checkOutDate: Date;
    rooms: number;
    totalPrice: Prisma.Decimal;
    currency: string;
  },
  hotelName: string,
) => ({
  itemId: stay.id,
  hotelId: stay.hotelId,
  hotelName,
  checkInDate: day(stay.checkInDate),
  checkOutDate: day(stay.checkOutDate),
  rooms: stay.rooms,
  totalPrice: stay.totalPrice.toFixed(2),
  currency: stay.currency,
});

export const flightDetails = (
  item: {
    id: string;
    flightId: string;
    passengers: number;
    totalPrice: Prisma.Decimal;
    currency: string;
  },
  flight: { flightNumber: string; departureAt: Date },
) => ({
  itemId: item.id,
  flightId: item.flightId,
  flightNumber: flight.flightNumber,
  departureAt: flight.departureAt.toISOString(),
  passengers: item.passengers,
  totalPrice: item.totalPrice.toFixed(2),
  currency: item.currency,
});

/** Sums prices per currency as decimal strings. */
export const totalsByCurrency = (
  items: { totalPrice: Prisma.Decimal; currency: string }[],
) => {
  const totals: Record<string, Prisma.Decimal> = {};
  for (const { totalPrice, currency } of items)
    totals[currency] = (totals[currency] ?? new Prisma.Decimal(0)).add(
      totalPrice,
    );
  return Object.fromEntries(
    Object.entries(totals).map(([currency, sum]) => [currency, sum.toFixed(2)]),
  );
};
