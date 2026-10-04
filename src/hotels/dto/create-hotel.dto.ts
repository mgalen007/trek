import { IsString, Length, IsInt, IsNumber, Min, IsOptional } from 'class-validator'

export class CreateHotelDto {
  @IsString()
  destinationId: string

  @IsString()
  name: string

  @IsString()
  address: string

  @IsOptional()
  @IsNumber()
  rating?: number
 
  @IsNumber()
  nightlyRate: number
 
  @IsString()
  @Length(3, 3)
  currency: string

  @IsInt()
  @Min(1)
  availableRooms: number
}