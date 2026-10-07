import { IsString, IsOptional, MinLength } from 'class-validator';
import { PaginationQueryParams } from 'common/types/pagination.types';

export class BrowsingQueryParams extends PaginationQueryParams {
  /** Free text matched against name, city and country (case-insensitive). */
  @IsOptional()
  @IsString()
  @MinLength(2)
  q?: string;

  /** Partial, case-insensitive match on the destination name. */
  @IsOptional()
  @IsString()
  name?: string;

  /** Exact country name, case-insensitive. */
  @IsOptional()
  @IsString()
  country?: string;
}
