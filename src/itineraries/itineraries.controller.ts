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
import { ItinerariesService } from './itineraries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ICurrentUser } from '../auth/types/user.types';
import { CreateItineraryDto } from './dto/create-itinerary.dto';
import { UpdateItineraryDto } from './dto/update-itinerary.dto';
import { AddHotelDto } from './dto/add-hotel.dto';
import { AddFlightDto } from './dto/add-flight.dto';
import { ItineraryQueryParams } from './types/itinerary-query.types';

@UseGuards(JwtAuthGuard)
@Controller('itineraries')
export class ItinerariesController {
  constructor(private itinerariesService: ItinerariesService) {}

  @Post()
  async create(
    @Body() dto: CreateItineraryDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.create(dto, currentUser);

    return itinerary;
  }

  @Get()
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
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.findOne(id, currentUser);

    return itinerary;
  }

  @Put(':id')
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
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.remove(id, currentUser);

    return itinerary;
  }

  @Post(':id/hotels')
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
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.confirm(id, currentUser);

    return itinerary;
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const itinerary = await this.itinerariesService.cancel(id, currentUser);

    return itinerary;
  }
}
