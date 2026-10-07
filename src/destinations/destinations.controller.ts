import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DestinationsService } from './destinations.service';
import { HotelsService } from '../hotels/hotels.service';
import { AirportsService } from '../airports/airports.service';
import { HotelSearchParams } from '../hotels/types/hotel-search.types';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { CreateDestinationDto } from './dto/create-destination.dto';
import { UpdateDestinationDto } from './dto/update-destination.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '../auth/types/auth.types';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { BrowsingQueryParams } from './types/browsing.types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('destinations')
export class DestinationsController {
  constructor(
    private destinationsService: DestinationsService,
    private hotelsService: HotelsService,
    private airportsService: AirportsService,
  ) {}

  @Get()
  async findAll(@Query() query: BrowsingQueryParams) {
    const destinations = await this.destinationsService.findAll(query);

    return destinations;
  }

  @Get(':id')
  async findOneById(@Param('id') id: string) {
    const destination = await this.destinationsService.findOneById(id);

    return destination;
  }

  // Same filters as GET /hotels, scoped to this destination.
  @Get(':id/hotels')
  async findHotels(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: HotelSearchParams,
  ) {
    await this.destinationsService.findOneById(id);
    const hotels = await this.hotelsService.findAll({
      ...query,
      destinationId: id,
    });

    return hotels;
  }

  @Get(':id/airports')
  async findAirports(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryParams,
  ) {
    await this.destinationsService.findOneById(id);
    const airports = await this.airportsService.findAll({
      ...query,
      destinationId: id,
    });

    return airports;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() dto: CreateDestinationDto) {
    const destination = await this.destinationsService.create(dto);

    return destination;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDestinationDto) {
    const destination = await this.destinationsService.update(id, dto);

    return destination;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const destination = await this.destinationsService.remove(id);

    return destination;
  }
}
