import { DestinationEntity } from '../../destinations/entities/destination.entity';

export class HotelEntity {
  id: string;
  destinationId: string;
  name: string;
  address: string;
  /** Decimal serialized as a string; null when unrated. */
  rating: string | null;
  /** Price per room per night, decimal serialized as a string. */
  nightlyRate: string;
  /** ISO 4217 currency code. */
  currency: string;
  totalRooms: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A hotel as returned by search. */
export class HotelSearchResultEntity extends HotelEntity {
  destination: DestinationEntity;
  /**
   * Free rooms for the requested nights. Only present when the search
   * included checkIn and checkOut.
   */
  availableRooms?: number;
}
