import { PartialType, PickType } from '@nestjs/swagger';
import { CreateItineraryDto } from './create-itinerary.dto';

/**
 * Rename or move a DRAFT itinerary. New dates must still contain every
 * hotel stay and flight already added.
 */
export class UpdateItineraryDto extends PartialType(
  PickType(CreateItineraryDto, ['name', 'startDate', 'endDate'] as const),
) {}
