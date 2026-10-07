import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

export class PaginationQueryParams {
  /** 1-based page number (default 1). */
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  /** Page size (default 15). */
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  limit?: number;
}
