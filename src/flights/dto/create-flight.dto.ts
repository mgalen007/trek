import { IsString, MinLength, IsNumber, IsDate, Min } from 'class-validator'

export class CreateFlightDto {
  @IsString()
  @MinLength(32)
  departureAirportId: string

  @IsString()
  @MinLength(32)
  arrivalAirportId: string

  @IsString()
  @MinLength(3)
  airline: string
 
  @IsString()
  @MinLength(3) 
  flightNumber: string
 
  @IsDate()
  departureAt: Date
 
  @IsDate()
  arrivalAt: Date

  @IsNumber()
  @Min(0)
  price: number
 
  @IsString()
  @MinLength(3)
  currency: string
 
  @IsNumber()
  @Min(6)
  availableSeats: number
}