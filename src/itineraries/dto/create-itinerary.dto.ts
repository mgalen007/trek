import { IsDate, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateItineraryDto {
  @IsString()
  @MinLength(3)
  name: string;

  /** Where the trip goes; hotel stays must be at this destination. */
  @IsUUID()
  destinationId: string;

  /** First day of the trip (YYYY-MM-DD), today or later. */
  @IsDate()
  @ApiProperty({ type: String, format: 'date', example: '2030-01-15' })
  startDate: Date;

  /** Last day of the trip (YYYY-MM-DD), on or after startDate. */
  @IsDate()
  @ApiProperty({ type: String, format: 'date', example: '2030-01-20' })
  endDate: Date;
}
