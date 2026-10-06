import { IsDate, IsInt, IsUUID, Min } from 'class-validator';

export class AddHotelDto {
  @IsUUID()
  hotelId: string;

  @IsDate()
  checkInDate: Date;

  @IsDate()
  checkOutDate: Date;

  @IsInt()
  @Min(1)
  rooms: number;
}
