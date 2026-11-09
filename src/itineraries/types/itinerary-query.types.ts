import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryParams } from 'common/types/pagination.types';
import {
  ItineraryEventType,
  ItineraryStatus,
} from '../../../generated/prisma/client';

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

export class ItineraryEventQueryParams extends PaginationQueryParams {
  /** Only events of this type. */
  @IsOptional()
  @IsEnum(ItineraryEventType)
  @ApiPropertyOptional({
    enum: Object.values(ItineraryEventType),
    enumName: 'ItineraryEventType',
  })
  type?: ItineraryEventType;
}
