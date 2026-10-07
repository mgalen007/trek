import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ICurrentUser } from '../auth/types/user.types';
import { PreferencesService } from './preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PreferencesEntity } from './entities/preferences.entity';
import {
  ApiDataResponse,
  ApiErrorResponses,
} from 'common/http/api-response.decorators';

@ApiTags('Preferences')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('users/me/preferences')
export class PreferencesController {
  constructor(private preferencesService: PreferencesService) {}

  @Get()
  @ApiOperation({
    summary: "Get the current user's travel preferences",
    description:
      'Defaults to use when planning: home airport, currency, budget, minimum hotel rating, party size and free-text notes. Always returns an object; unset fields are null.',
  })
  @ApiDataResponse(PreferencesEntity)
  async get(@CurrentUser() currentUser: ICurrentUser) {
    const preferences = await this.preferencesService.get(currentUser.id);

    return preferences;
  }

  @Put()
  @ApiOperation({
    summary: "Update the current user's travel preferences",
    description: 'Only the fields sent are changed; send null to clear one.',
  })
  @ApiDataResponse(PreferencesEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST], {
    [HttpStatus.BAD_REQUEST]:
      'Invalid input (VALIDATION_FAILED), or unknown homeAirportId (INVALID_REFERENCE)',
  })
  async update(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    const preferences = await this.preferencesService.update(
      currentUser.id,
      dto,
    );

    return preferences;
  }
}
