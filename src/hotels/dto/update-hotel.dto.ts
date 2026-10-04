import { IsString, Length, IsInt, IsNumber, Min, IsOptional } from 'class-validator'

export class CreateHotelDto {
  @IsOptional()
  @IsString()
  destinationId?: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsNumber()
  rating?: number

  @IsOptional()
  @IsNumber()
  nightlyRate?: number

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  availableRooms?: number
}