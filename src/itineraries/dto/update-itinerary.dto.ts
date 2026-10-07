import { IsDate, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateItineraryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsDate()
  endDate?: Date;
}
