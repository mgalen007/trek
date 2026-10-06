import { IsString, IsUUID, MinLength, IsOptional } from 'class-validator';

export class UpdateAirportDto {
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  name?: string;
}
