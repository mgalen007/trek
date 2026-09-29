import { IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator'

export class UpdateAirportDto {
  @IsOptional()
  @IsString()
  @MinLength(32)
  destinationId: string

  @IsOptional()
  @IsString()
  @MinLength(3)
  code: string

  @IsOptional()
  @IsString()
  @MinLength(5)
  name: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city: string

  @IsOptional()
  @IsString()
  @MinLength(4)
  country: string
}