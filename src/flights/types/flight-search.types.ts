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

export const FLIGHT_SORT_FIELDS = ['departureAt', 'price'] as const;

export class FlightSearchParams extends PaginationQueryParams {
  // Airport codes (e.g. NBO, KGL)…
  @IsOptional()
  @IsString()
  @Length(3, 4)
  from?: string;

  @IsOptional()
  @IsString()
  @Length(3, 4)
  to?: string;

  // …or any airport serving a destination.
  @IsOptional()
  @IsUUID()
  fromDestinationId?: string;

  @IsOptional()
  @IsUUID()
  toDestinationId?: string;

  // Calendar day (UTC) the flight departs on.
  @IsOptional()
  @IsDate()
  date?: Date;

  // Only flights with at least this many seats left.
  @IsOptional()
  @IsInt()
  @Min(1)
  passengers?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsIn(FLIGHT_SORT_FIELDS)
  sort?: (typeof FLIGHT_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
