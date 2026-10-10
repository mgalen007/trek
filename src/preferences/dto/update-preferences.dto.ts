import {
  IsInt,
  IsISO4217CurrencyCode,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { UpperCase } from 'common/helpers/transform.helpers';

/** Omitted fields are left unchanged; send null to clear a field. */
export class UpdatePreferencesDto {
  /** Airport the user usually departs from. */
  @IsOptional()
  @IsUUID()
  homeAirportId?: string | null;

  /** Preferred ISO 4217 currency, e.g. USD (case-insensitive). */
  @IsOptional()
  @UpperCase()
  @IsISO4217CurrencyCode()
  currency?: string | null;

  /** Highest acceptable price per room per night. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxNightlyRate?: number | null;

  /** Lowest acceptable hotel rating. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minHotelRating?: number | null;

  /** Usual number of people travelling. Cannot be cleared. */
  @ValidateIf((o: UpdatePreferencesDto) => o.defaultTravelers !== undefined)
  @IsInt()
  @Min(1)
  @Max(20)
  defaultTravelers?: number;

  /** Free-text preferences, e.g. "aisle seat, vegetarian, quiet hotels". */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
