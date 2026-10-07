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

export const FLIGHT_SORT_FIELDS = ['departureAt', 'price'] as const;

/** Only upcoming flights are ever returned. */
export class FlightSearchParams extends PaginationQueryParams {
  /** Departure airport code, e.g. NBO (case-insensitive). */
  @IsOptional()
  @IsString()
  @Length(3, 4)
  from?: string;

  /** Arrival airport code, e.g. KGL (case-insensitive). */
  @IsOptional()
  @IsString()
  @Length(3, 4)
  to?: string;

  /** Depart from any airport serving this destination. */
  @IsOptional()
  @IsUUID()
  fromDestinationId?: string;

  /** Arrive at any airport serving this destination. */
  @IsOptional()
  @IsUUID()
  toDestinationId?: string;

  /** Departure day in UTC (YYYY-MM-DD). */
  @IsOptional()
  @IsDate()
  @ApiPropertyOptional({ type: String, format: 'date', example: '2030-01-15' })
  date?: Date;

  /** Only flights with at least this many seats left. */
  @IsOptional()
  @IsInt()
  @Min(1)
  passengers?: number;

  /** Maximum price per passenger. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  /** ISO 4217 code, case-insensitive. */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsIn(FLIGHT_SORT_FIELDS)
  @ApiPropertyOptional({ enum: FLIGHT_SORT_FIELDS, default: 'departureAt' })
  sort?: (typeof FLIGHT_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  order?: 'asc' | 'desc';
}
