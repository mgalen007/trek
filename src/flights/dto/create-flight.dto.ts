import { IsString, IsUUID, IsInt, MinLength, IsNumber, IsDate, Min } from 'class-validator'

export class CreateFlightDto {
  @IsUUID()
  departureAirportId: string

  @IsUUID()
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
 
  @IsInt()
  @Min(0)
  availableSeats: number
}