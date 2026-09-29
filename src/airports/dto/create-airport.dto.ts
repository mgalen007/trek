import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateAirportDto {
  @IsString()
  @MinLength(32)
  destinationId: string;

  @IsString()
  @MinLength(3)
  code: string;

  @IsString()
  @MinLength(5)
  name: string;
}
