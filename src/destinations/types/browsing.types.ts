import { IsString, IsNumber, IsOptional } from 'class-validator';

export class BrowsingQueryParams {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
