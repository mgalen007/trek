import { IsString, IsOptional, MinLength } from 'class-validator';
import { PaginationQueryParams } from 'common/types/pagination.types';

export class BrowsingQueryParams extends PaginationQueryParams {
  // Free text matched against name, city and country.
  @IsOptional()
  @IsString()
  @MinLength(2)
  q?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
