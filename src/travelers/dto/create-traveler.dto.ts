import {
  IsDate,
  IsISO31661Alpha2,
  IsString,
  MaxDate,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UpperCase } from 'common/helpers/transform.helpers';

export class CreateTravelerDto {
  /** Given name(s) as on the travel document. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  /** Family name(s) as on the travel document. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  /** Date of birth (YYYY-MM-DD), in the past. */
  @IsDate()
  @MaxDate(() => new Date())
  @ApiProperty({ type: String, format: 'date', example: '1990-04-21' })
  dateOfBirth: Date;

  /** ISO 3166-1 alpha-2 country code, e.g. RW (case-insensitive). */
  @UpperCase()
  @IsISO31661Alpha2()
  nationality: string;
}
