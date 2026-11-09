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

  /** Who did it; null once that account has been deleted. */
  actorId: string | null;

  /** ADMIN when someone else acted on the owner's behalf. */
  @ApiProperty({ enum: Role, enumName: 'Role' })
  actorRole: Role;

  /**
   * Facts copied at the time, so they stay readable after items or
   * catalogue records change. By type:
   * - CREATED: `{ name, destinationId, startDate, endDate }`
   * - UPDATED: `{ changes: { <field>: { from, to } } }`
   * - HOTEL_ADDED / HOTEL_REMOVED: `{ itemId, hotelId, hotelName, checkInDate, checkOutDate, rooms, totalPrice, currency }`
   * - FLIGHT_ADDED / FLIGHT_REMOVED: `{ itemId, flightId, flightNumber, departureAt, passengers, totalPrice, currency }`
   * - CONFIRMED: `{ hotelStays, flights, totals: { <currency>: <amount> } }`
   * - CANCELLED: `{ hotelStays, flights, releasedSeats }`
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
