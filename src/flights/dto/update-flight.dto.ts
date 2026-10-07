import {
  IsString,
  IsUUID,
  IsInt,
  MinLength,
  IsNumber,
  IsDate,
  Min,
  IsOptional,
} from 'class-validator';

export class UpdateFlightDto {
  @IsOptional()
  @IsUUID()
  departureAirportId?: string;

  @IsOptional()
  @IsUUID()
  arrivalAirportId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  airline?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  flightNumber?: string;

  @IsOptional()
  @IsDate()
  departureAt?: Date;

  @IsOptional()
  @IsDate()
  arrivalAt?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  availableSeats?: number;
}
