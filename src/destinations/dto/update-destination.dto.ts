import { PartialType } from '@nestjs/swagger';
import { CreateDestinationDto } from './create-destination.dto';

/** Same fields and rules as CreateDestinationDto, all optional. */
export class UpdateDestinationDto extends PartialType(CreateDestinationDto) {}
