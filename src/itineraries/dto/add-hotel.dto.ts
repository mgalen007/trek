import { IsDate, IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddHotelDto {
  /** A hotel at the itinerary's destination. */
  @IsUUID()
  hotelId: string;

  /** First night (YYYY-MM-DD), within the trip dates. */
  @IsDate()
  @ApiProperty({ type: String, format: 'date', example: '2030-01-15' })
  checkInDate: Date;

  /** Check-out day (YYYY-MM-DD), after checkInDate and by the trip's end. */
  @IsDate()
  @ApiProperty({ type: String, format: 'date', example: '2030-01-18' })
  checkOutDate: Date;

  @IsInt()
  @Min(1)
  rooms: number;
}
