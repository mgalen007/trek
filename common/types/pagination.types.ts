import { IsNumber, IsOptional } from 'class-validator'

export class PaginationQueryParams {
  @IsNumber()
  @IsOptional()
  page?: number

  @IsNumber()
  @IsOptional()
  limit?: number
}