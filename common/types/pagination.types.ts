import { IsInt, IsOptional, Min } from 'class-validator'

export class PaginationQueryParams {
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number

  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number
}