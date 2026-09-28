import { IsString, MinLength, IsNumber, IsOptional } from 'class-validator'

export class UpdateDestinationDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  name?: string

  @IsString()
  @IsOptional()
  city?: string

  @IsString()
  @IsOptional()
  @MinLength(4)
  country?: string

  @IsString()
  @IsOptional()
  @MinLength(8)
  description?: string

  @IsNumber()
  @IsOptional()
  latitude?: number

  @IsNumber()
  @IsOptional()
  longitude?: number
}