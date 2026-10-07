import { PartialType } from '@nestjs/swagger';
import { CreateAirportDto } from './create-airport.dto';

/** Same fields and rules as CreateAirportDto, all optional. */
export class UpdateAirportDto extends PartialType(CreateAirportDto) {}
