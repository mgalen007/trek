import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQueryParams } from 'common/types/pagination.types';

export class AirportQueryParams extends PaginationQueryParams {
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 4)
  code?: string;
}
