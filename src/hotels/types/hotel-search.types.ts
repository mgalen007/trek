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
import { PaginationQueryParams } from 'common/types/pagination.types';

export const HOTEL_SORT_FIELDS = ['name', 'price', 'rating'] as const;

export class HotelSearchParams extends PaginationQueryParams {
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minRating?: number;

  // checkIn + checkOut restrict results to hotels with free rooms for those
  // nights; `rooms` (default 1) is how many are needed.
  @IsOptional()
  @IsDate()
  checkIn?: Date;

  @IsOptional()
  @IsDate()
  checkOut?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  rooms?: number;

  @IsOptional()
  @IsIn(HOTEL_SORT_FIELDS)
  sort?: (typeof HOTEL_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
