import { PartialType } from '@nestjs/swagger';
import { CreateTravelerDto } from './create-traveler.dto';

/** Same fields and rules as CreateTravelerDto, all optional. */
export class UpdateTravelerDto extends PartialType(CreateTravelerDto) {}
