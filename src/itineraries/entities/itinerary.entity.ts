import { ApiProperty } from '@nestjs/swagger';
import {
  BookingStatus,
  ItineraryStatus,
} from '../../../generated/prisma/client';
import { DestinationEntity } from '../../destinations/entities/destination.entity';
import { HotelEntity } from '../../hotels/entities/hotel.entity';
import { FlightWithAirportsEntity } from '../../flights/entities/flight.entity';
import { TravelerEntity } from '../../travelers/entities/traveler.entity';

export class ItineraryEntity {
  id: string;
  userId: string;
  destinationId: string;
  name: string;
  /** First day of the trip (UTC midnight). */
  startDate: Date;
  /** Last day of the trip (UTC midnight). */
  endDate: Date;
  /**
   * DRAFT: editable, nothing reserved. PLANNED: confirmed, inventory held.
   * CANCELLED: released. COMPLETED: trip is over.
   */
  @ApiProperty({
    enum: Object.values(ItineraryStatus),
    enumName: 'ItineraryStatus',
  })
  status: ItineraryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class ItinerarySummaryEntity extends ItineraryEntity {
  destination: DestinationEntity;
}

export class ItineraryHotelEntity {
  id: string;
  itineraryId: string;
  hotelId: string;
  checkInDate: Date;
  checkOutDate: Date;
  rooms: number;
  /** HELD while the itinerary is a draft, CONFIRMED once it's planned. */
  @ApiProperty({
    enum: Object.values(BookingStatus),
    enumName: 'BookingStatus',
  })
  status: BookingStatus;
  /** Price snapshot per room per night, decimal string. */
  nightlyRate: string;
  /** nights x rooms x nightlyRate, decimal string. */
  totalPrice: string;
  currency: string;
  hotel: HotelEntity;
  createdAt: Date;
  updatedAt: Date;
}

export class ItineraryFlightEntity {
  id: string;
  itineraryId: string;
  flightId: string;
  passengers: number;
  /** HELD while the itinerary is a draft, CONFIRMED once it's planned. */
  @ApiProperty({
    enum: Object.values(BookingStatus),
    enumName: 'BookingStatus',
  })
  status: BookingStatus;
  /** Price snapshot per passenger, decimal string. */
  unitPrice: string;
  /** passengers x unitPrice, decimal string. */
  totalPrice: string;
  currency: string;
  flight: FlightWithAirportsEntity;
  /** Named passengers, when travelerIds were given. */
  travelers: TravelerEntity[];
  createdAt: Date;
  updatedAt: Date;
}

export class ItineraryDetailEntity extends ItinerarySummaryEntity {
  itineraryHotel: ItineraryHotelEntity[];
  itineraryFlight: ItineraryFlightEntity[];
  /**
   * Sum of non-cancelled items per currency, as decimal strings,
   * e.g. `{ "USD": "1100" }`.
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { USD: '1100' },
  })
  totals: Record<string, string>;
}
