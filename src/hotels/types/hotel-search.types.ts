import {
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryParams } from 'common/types/pagination.types';

export const HOTEL_SORT_FIELDS = ['name', 'price', 'rating'] as const;

export class HotelSearchParams extends PaginationQueryParams {
  /** Only hotels at this destination. */
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  /** Minimum nightly rate. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  /** Maximum nightly rate. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  /** ISO 4217 code, case-insensitive. Combine with price filters. */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /** Minimum rating; unrated hotels are excluded when set. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minRating?: number;

  /**
   * First night (YYYY-MM-DD). With checkOut, only hotels with enough free
   * rooms for every night are returned, each with `availableRooms`.
   */
  @IsOptional()
  @IsDate()
  @ApiPropertyOptional({ type: String, format: 'date', example: '2030-01-15' })
  checkIn?: Date;

  /** Check-out day (YYYY-MM-DD), after checkIn. */
  @IsOptional()
  @IsDate()
  @ApiPropertyOptional({ type: String, format: 'date', example: '2030-01-18' })
  checkOut?: Date;

  /**
   * Rooms needed (default 1). Without dates, filters on the hotel's total
   * rooms instead.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  rooms?: number;

  @IsOptional()
  @IsIn(HOTEL_SORT_FIELDS)
  @ApiPropertyOptional({ enum: HOTEL_SORT_FIELDS, default: 'name' })
  sort?: (typeof HOTEL_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  order?: 'asc' | 'desc';
}
