import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { ItineraryStatus } from '../../../generated/prisma/client';

export class ItineraryQueryParams extends PaginationQueryParams {
  /** Only itineraries in this status. */
  @IsOptional()
  @IsEnum(ItineraryStatus)
  @ApiPropertyOptional({
    enum: Object.values(ItineraryStatus),
    enumName: 'ItineraryStatus',
  })
  status?: ItineraryStatus;
}
