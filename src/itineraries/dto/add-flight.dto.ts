import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Give `passengers`, `travelerIds`, or both (counts must then match). */
export class AddFlightDto {
  @IsUUID()
  flightId: string;

  /** Number of seats. Defaults to the number of travelerIds. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  passengers?: number;

  /** The current user's travelers flying on this booking (see /travelers). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  travelerIds?: string[];
}
