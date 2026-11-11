import { ApiProperty } from '@nestjs/swagger';
import { ItineraryStatus } from '../../../generated/prisma/client';
import { ErrorCode } from 'common/http/api-error';

export class QuoteHotelStayEntity {
  itemId: string;
  hotelId: string;
  hotelName: string;
  /** YYYY-MM-DD */
  checkInDate: string;
  /** YYYY-MM-DD */
  checkOutDate: string;
  rooms: number;
  /** Current price per room per night, decimal string. */
  nightlyRate: string;
  /** Current nights x rooms x nightlyRate, decimal string. */
  totalPrice: string;
  currency: string;
  /** The price differs from the one snapshotted when the stay was added. */
  priceChanged: boolean;
}

export class QuoteFlightEntity {
  itemId: string;
  flightId: string;
  flightNumber: string;
  airline: string;
  departureAt: Date;
  passengers: number;
  /** Current price per passenger, decimal string. */
  unitPrice: string;
  /** Current passengers x unitPrice, decimal string. */
  totalPrice: string;
  currency: string;
  /** The price differs from the one snapshotted when the flight was added. */
  priceChanged: boolean;
}

/** Something that would make confirm fail right now. */
export class QuoteIssueEntity {
  /** The error code confirm would answer with. */
  @ApiProperty({ enum: Object.values(ErrorCode), enumName: 'ErrorCode' })
  code: ErrorCode;
  /** The hotel stay or flight concerned, if any. */
  itemId?: string;
  message: string;
}

export class ItineraryQuoteEntity {
  itineraryId: string;

  @ApiProperty({
    enum: Object.values(ItineraryStatus),
    enumName: 'ItineraryStatus',
  })
  status: ItineraryStatus;

  /** Send as `expectedVersion` to confirm. */
  version: number;

  /** Whether confirm would succeed right now (no issues). */
  bookable: boolean;

  /**
   * Current total per currency, e.g. `{ "USD": "1100.00" }`. Send as
   * `expectedTotals` to confirm.
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { USD: '1100.00' },
  })
  totals: Record<string, string>;

  hotelStays: QuoteHotelStayEntity[];
  flights: QuoteFlightEntity[];

  /**
   * Problems that would make confirm fail. Availability is checked per item,
   * so confirm can still find two items of this trip competing for the same
   * last rooms, or lose a race with another booking.
   */
  issues: QuoteIssueEntity[];
}
