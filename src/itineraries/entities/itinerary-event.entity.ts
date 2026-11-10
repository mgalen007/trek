import { ApiProperty } from '@nestjs/swagger';
import { ItineraryEventType } from '../../../generated/prisma/client';
import { Role } from '../../auth/types/auth.types';

/** One entry in an itinerary's history. */
export class ItineraryEventEntity {
  id: string;
  itineraryId: string;

  @ApiProperty({
    enum: Object.values(ItineraryEventType),
    enumName: 'ItineraryEventType',
  })
  type: ItineraryEventType;

  /**
   * Who did it; null once that account has been deleted, or when the system
   * did it (then actorRole is null too).
   */
  actorId: string | null;

  /**
   * ADMIN when someone else acted on the owner's behalf; null when the
   * system did it (e.g. COMPLETED).
   */
  @ApiProperty({ enum: Role, enumName: 'Role', nullable: true })
  actorRole: Role | null;

  /**
   * Facts copied at the time, so they stay readable after items or
   * catalogue records change. By type:
   * - CREATED: `{ name, destinationId, startDate, endDate }`
   * - UPDATED: `{ changes: { <field>: { from, to } } }`
   * - HOTEL_ADDED / HOTEL_REMOVED: `{ itemId, hotelId, hotelName, checkInDate, checkOutDate, rooms, totalPrice, currency }`
   * - FLIGHT_ADDED / FLIGHT_REMOVED: `{ itemId, flightId, flightNumber, departureAt, passengers, totalPrice, currency }`
   * - CONFIRMED: `{ hotelStays, flights, totals: { <currency>: <amount> } }`
   * - CANCELLED: `{ hotelStays, flights, releasedSeats }`
   * - COMPLETED: `{ endDate }` — by the system, the day after the trip ends
   *
   * Prices are decimal strings.
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  details: Record<string, unknown> | null;

  createdAt: Date;
}
