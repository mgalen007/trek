import { AirportEntity } from '../../airports/entities/airport.entity';

export class PreferencesEntity {
  userId: string;
  homeAirportId: string | null;
  /** Departure airport details, when set. */
  homeAirport: AirportEntity | null;
  /** ISO 4217 code, e.g. USD. */
  currency: string | null;
  /** Decimal serialized as a string. */
  maxNightlyRate: string | null;
  /** Decimal serialized as a string. */
  minHotelRating: string | null;
  defaultTravelers: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
