import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ICurrentUser } from '../auth/types/user.types';
import { PaginationQueryParams } from 'common/types/pagination.types';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPageResponse,
} from 'common/http/api-response.decorators';
import { TravelersService } from './travelers.service';
import { CreateTravelerDto } from './dto/create-traveler.dto';
import { UpdateTravelerDto } from './dto/update-traveler.dto';
import { TravelerEntity } from './entities/traveler.entity';

@ApiTags('Travelers')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('travelers')
export class TravelersController {
  constructor(private travelersService: TravelersService) {}

  @Post()
  @ApiOperation({
    summary: 'Add a traveler',
    description:
      'Someone the current user books for, including themselves. Name them on flight bookings with `travelerIds`.',
  })
  @ApiDataResponse(TravelerEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async create(
    @Body() dto: CreateTravelerDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const traveler = await this.travelersService.create(dto, currentUser);

    return traveler;
  }

  @Get()
  @ApiOperation({ summary: "List the current user's travelers" })
  @ApiPageResponse(TravelerEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async findAll(
    @Query() query: PaginationQueryParams,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const travelers = await this.travelersService.findAll(currentUser, query);

    return travelers;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a traveler' })
  @ApiDataResponse(TravelerEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const traveler = await this.travelersService.findOne(id, currentUser);

    return traveler;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a traveler' })
  @ApiDataResponse(TravelerEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTravelerDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const traveler = await this.travelersService.update(id, currentUser, dto);

    return traveler;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a traveler',
    description:
      'Not allowed while the traveler is on a held or confirmed flight booking.',
  })
  @ApiDataResponse(TravelerEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND, HttpStatus.CONFLICT], {
    [HttpStatus.CONFLICT]: 'On an active flight booking (TRAVELER_IN_USE)',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const traveler = await this.travelersService.remove(id, currentUser);

    return traveler;
  }
}
