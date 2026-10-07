import { PartialType } from '@nestjs/swagger';
import { CreateFlightDto } from './create-flight.dto';

/** Same fields and rules as CreateFlightDto, all optional. */
export class UpdateFlightDto extends PartialType(CreateFlightDto) {}
