import { AgentAllowed } from '../auth/decorators/agent-allowed.decorator';
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
import { ConfirmItineraryDto } from './dto/confirm-itinerary.dto';
import { ItineraryQuoteEntity } from './entities/itinerary-quote.entity';
import {
  ItineraryEventQueryParams,
  ItineraryQueryParams,
} from './types/itinerary-query.types';
import { ItineraryEventEntity } from './entities/itinerary-event.entity';
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
import { Idempotent } from '../idempotency/idempotent.decorator';

const NOT_DRAFT = 'Itinerary is not a DRAFT (INVALID_STATUS)';

@ApiTags('Itineraries')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class ItinerariesController {
  constructor(private itinerariesService: ItinerariesService) {}

  @AgentAllowed()
  @Post()
  @Idempotent()
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

  @AgentAllowed()
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

  @AgentAllowed()
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

  @AgentAllowed()
  @Get(':id/events')
  @ApiOperation({
    summary: "Get an itinerary's activity history",
    description:
      'What happened to the itinerary, newest first: creation, edits, items added or removed, confirmation and cancellation, with who did it.',
  })
  @ApiPageResponse(ItineraryEventEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async findEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ItineraryEventQueryParams,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const events = await this.itinerariesService.findEvents(
      id,
      currentUser,
      query,
    );

    return events;
  }

  @AgentAllowed()
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

  @AgentAllowed()
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

  @AgentAllowed()
  @Post(':id/hotels')
  @Idempotent()
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

  @AgentAllowed()
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

  @AgentAllowed()
  @Post(':id/flights')
  @Idempotent()
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

  @AgentAllowed()
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

  @AgentAllowed()
  @Get(':id/quote')
  @ApiOperation({
    summary: 'Quote a draft before confirming',
    description:
      'Every item at current prices, the totals, the version, and any problem that would make confirm fail (bookable is false). Reserves nothing. Show this to the user, then send its version and totals to confirm.',
  })
  @ApiDataResponse(ItineraryQuoteEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async quote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const quote = await this.itinerariesService.quote(id, currentUser);

    return quote;
  }

  @Post(':id/confirm')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a draft, reserving everything',
    description:
      'DRAFT -> PLANNED. Send the version and totals from GET /itineraries/:id/quote: the trip is booked only if it is still exactly that version at those prices (otherwise ITINERARY_CHANGED or PRICE_CHANGED: quote again and show the user). Reserves every room and seat, all or nothing. On BOOKING_CONFLICT a concurrent booking interfered: retry. Not available to agent tokens: the user confirms.',
  })
  @ApiDataResponse(ItineraryDetailEntity)
  @ApiErrorResponses(
    [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
    {
      [HttpStatus.CONFLICT]: `ITINERARY_CHANGED or PRICE_CHANGED (quote again), ROOMS_UNAVAILABLE, SEATS_UNAVAILABLE, BOOKING_CONFLICT (retry), or ${NOT_DRAFT}`,
    },
  )
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmItineraryDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.confirm(
      id,
      currentUser,
      dto,
    );

    return itinerary;
  }

  @Post(':id/cancel')
  @Idempotent()
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
