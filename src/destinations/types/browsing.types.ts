import { IsString, IsInt, IsOptional, Min } from 'class-validator';

export class BrowsingQueryParams {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
