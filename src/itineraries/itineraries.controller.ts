import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ItinerariesService } from './itineraries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ICurrentUser } from '../auth/types/user.types';
import { CreateItineraryDto } from './dto/create-itinerary.dto';
import { UpdateItineraryDto } from './dto/update-itinerary.dto';
import { AddHotelDto } from './dto/add-hotel.dto';
import { AddFlightDto } from './dto/add-flight.dto';
import { ItineraryQueryParams } from './types/itinerary-query.types';
import {
  ItineraryDetailEntity,
  ItineraryEntity,
  ItinerarySummaryEntity,
} from './entities/itinerary.entity';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPageResponse,
} from 'common/http/api-response.decorators';

const NOT_DRAFT = 'Itinerary is not a DRAFT (INVALID_STATUS)';

@ApiTags('Itineraries')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class ItinerariesController {
  constructor(private itinerariesService: ItinerariesService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a draft itinerary',
    description:
      'Creates an empty DRAFT trip. Add hotel stays and flights, then confirm it to reserve everything at once.',
  })
  @ApiDataResponse(ItineraryDetailEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async create(
    @Body() dto: CreateItineraryDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.create(dto, currentUser);

    return itinerary;
  }

  @Get()
  @ApiOperation({ summary: "List the current user's itineraries" })
  @ApiPageResponse(ItinerarySummaryEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async findAll(
    @Query() query: ItineraryQueryParams,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itineraries = await this.itinerariesService.findAll(
      currentUser,
      query,
    );

    return itineraries;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an itinerary with its hotel stays, flights and totals',
    description: "Other users' itineraries are reported as not found.",
  })
  @ApiDataResponse(ItineraryDetailEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.findOne(id, currentUser);

    return itinerary;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Rename or re-date a draft itinerary' })
  @ApiDataResponse(ItineraryDetailEntity)
  @ApiErrorResponses(
    [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
    { [HttpStatus.CONFLICT]: NOT_DRAFT },
  )
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItineraryDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.update(
      id,
      currentUser,
      dto,
    );

    return itinerary;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a draft or cancelled itinerary',
    description: 'Planned itineraries must be cancelled first.',
  })
  @ApiDataResponse(ItineraryEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND, HttpStatus.CONFLICT], {
    [HttpStatus.CONFLICT]: 'Itinerary is PLANNED or COMPLETED (INVALID_STATUS)',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.remove(id, currentUser);

    return itinerary;
  }

  @Post(':id/hotels')
  @ApiOperation({
    summary: 'Add a hotel stay to a draft',
    description:
      'The hotel must be at the itinerary destination and the stay within the trip dates. Rooms are checked now but only reserved on confirm.',
  })
  @ApiDataResponse(ItineraryDetailEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses(
    [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
    {
      [HttpStatus.CONFLICT]: `Not enough free rooms (ROOMS_UNAVAILABLE), or ${NOT_DRAFT}`,
    },
  )
  async addHotel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddHotelDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.addHotel(
      id,
      currentUser,
      dto,
    );

    return itinerary;
  }

  @Delete(':id/hotels/:itemId')
  @ApiOperation({ summary: 'Remove a hotel stay from a draft' })
  @ApiDataResponse(ItineraryDetailEntity)
  @ApiErrorResponses(
    [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
    { [HttpStatus.CONFLICT]: NOT_DRAFT },
  )
  async removeHotel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.removeHotel(
      id,
      itemId,
      currentUser,
    );

    return itinerary;
  }

  @Post(':id/flights')
  @ApiOperation({
    summary: 'Add a flight to a draft',
    description:
      'The flight must depart within the trip dates. Seats are checked now but only reserved on confirm.',
  })
  @ApiDataResponse(ItineraryDetailEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses(
    [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
    {
      [HttpStatus.BAD_REQUEST]:
        "Invalid input, passengers not matching travelerIds, or someone else's traveler (INVALID_REFERENCE)",
      [HttpStatus.CONFLICT]: `Not enough seats (SEATS_UNAVAILABLE), or ${NOT_DRAFT}`,
    },
  )
  async addFlight(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddFlightDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.addFlight(
      id,
      currentUser,
      dto,
    );

    return itinerary;
  }

  @Delete(':id/flights/:itemId')
  @ApiOperation({ summary: 'Remove a flight from a draft' })
  @ApiDataResponse(ItineraryDetailEntity)
  @ApiErrorResponses(
    [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
    { [HttpStatus.CONFLICT]: NOT_DRAFT },
  )
  async removeFlight(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.removeFlight(
      id,
      itemId,
      currentUser,
    );

    return itinerary;
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a draft, reserving everything',
    description:
      'DRAFT -> PLANNED. Re-checks and reserves every room and seat at current prices, all or nothing. On BOOKING_CONFLICT a concurrent booking interfered: retry.',
  })
  @ApiDataResponse(ItineraryDetailEntity)
  @ApiErrorResponses(
    [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
    {
      [HttpStatus.CONFLICT]: `ROOMS_UNAVAILABLE, SEATS_UNAVAILABLE, BOOKING_CONFLICT (retry), or ${NOT_DRAFT}`,
    },
  )
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.confirm(id, currentUser);

    return itinerary;
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a planned itinerary, releasing everything',
    description:
      'PLANNED -> CANCELLED. Seats and rooms become available again.',
  })
  @ApiDataResponse(ItineraryDetailEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND, HttpStatus.CONFLICT], {
    [HttpStatus.CONFLICT]: 'Itinerary is not PLANNED (INVALID_STATUS)',
  })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.cancel(id, currentUser);

    return itinerary;
  }
}
