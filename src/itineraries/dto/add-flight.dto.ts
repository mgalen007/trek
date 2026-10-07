import { IsInt, IsUUID, Min } from 'class-validator';

export class AddFlightDto {
  @IsUUID()
  flightId: string;

  @IsInt()
  @Min(1)
  passengers: number;
}
