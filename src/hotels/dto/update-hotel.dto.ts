import { PartialType } from '@nestjs/swagger';
import { CreateHotelDto } from './create-hotel.dto';

/** Same fields and rules as CreateHotelDto, all optional. */
export class UpdateHotelDto extends PartialType(CreateHotelDto) {}
