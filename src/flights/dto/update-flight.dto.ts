import { IsString, MinLength, IsNumber, IsDate, Min, IsOptional } from 'class-validator'

export class CreateFlightDto {
  @IsOptional()
  @IsString()
  @MinLength(32)
  departureAirportId?: string

  @IsOptional()
  @IsString()
  @MinLength(32)
  arrivalAirportId?: string

  @IsOptional()
  @IsString()
  @MinLength(3)
  airline?: string

  @IsOptional()
  @IsString()
  @MinLength(3) 
  flightNumber?: string

  @IsOptional()
  @IsDate()
  departureAt?: Date

  @IsOptional()
  @IsDate()
  arrivalAt?: Date

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number

  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string

  @IsOptional()
  @IsNumber()
  @Min(6)
  availableSeats?: number
}