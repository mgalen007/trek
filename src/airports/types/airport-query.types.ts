import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQueryParams } from 'common/types/pagination.types';

export class AirportQueryParams extends PaginationQueryParams {
  /** Only airports serving this destination. */
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  /** Airport code, e.g. KGL (case-insensitive). */
  @IsOptional()
  @IsString()
  @Length(3, 4)
  code?: string;
}
