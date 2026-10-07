import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { ItineraryStatus } from '../../../generated/prisma/client';

export class ItineraryQueryParams extends PaginationQueryParams {
  @IsOptional()
  @IsEnum(ItineraryStatus)
  status?: ItineraryStatus;
}
