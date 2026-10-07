import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAirportDto {
  @IsUUID()
  destinationId: string;

  @IsString()
  @MinLength(3)
  code: string;

  @IsString()
  @MinLength(5)
  name: string;
}
