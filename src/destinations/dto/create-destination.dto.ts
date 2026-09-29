import { IsString, MinLength, IsNumber, IsOptional } from 'class-validator';

export class CreateDestinationDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsString()
  city: string;

  @IsString()
  @MinLength(4)
  country: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  description?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;
}
