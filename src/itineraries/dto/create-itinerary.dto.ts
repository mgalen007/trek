import { IsDate, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateItineraryDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsUUID()
  destinationId: string;

  @IsDate()
  startDate: Date;

  @IsDate()
  endDate: Date;
}
