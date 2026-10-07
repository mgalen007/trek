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
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DestinationsService } from './destinations.service';
import { HotelsService } from '../hotels/hotels.service';
import { AirportsService } from '../airports/airports.service';
import { HotelSearchParams } from '../hotels/types/hotel-search.types';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { CreateDestinationDto } from './dto/create-destination.dto';
import { UpdateDestinationDto } from './dto/update-destination.dto';
import { AdminOnly } from 'src/auth/decorators/admin-only.decorator';
import { BrowsingQueryParams } from './types/browsing.types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { DestinationEntity } from './entities/destination.entity';
import { HotelSearchResultEntity } from '../hotels/entities/hotel.entity';
import { AirportEntity } from '../airports/entities/airport.entity';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPageResponse,
} from 'common/http/api-response.decorators';
import { Idempotent } from '../idempotency/idempotent.decorator';

@ApiTags('Destinations')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('destinations')
export class DestinationsController {
  constructor(
    private destinationsService: DestinationsService,
    private hotelsService: HotelsService,
    private airportsService: AirportsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Search destinations',
    description: 'Use `q` to match name, city or country at once.',
  })
  @ApiPageResponse(DestinationEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async findAll(@Query() query: BrowsingQueryParams) {
    const destinations = await this.destinationsService.findAll(query);

    return destinations;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a destination by id' })
  @ApiDataResponse(DestinationEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async findOneById(@Param('id') id: string) {
    const destination = await this.destinationsService.findOneById(id);

    return destination;
  }

  @Get(':id/hotels')
  @ApiOperation({
    summary: "Search a destination's hotels",
    description:
      'Same filters as `GET /hotels`; the destination in the path overrides any `destinationId` in the query.',
  })
  @ApiPageResponse(HotelSearchResultEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
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
  @ApiOperation({ summary: "List a destination's airports" })
  @ApiPageResponse(AirportEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
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

  @AdminOnly()
  @Post()
  @Idempotent()
  @ApiOperation({ summary: 'Create a destination (admin)' })
  @ApiDataResponse(DestinationEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async create(@Body() dto: CreateDestinationDto) {
    const destination = await this.destinationsService.create(dto);

    return destination;
  }

  @AdminOnly()
  @Put(':id')
  @ApiOperation({ summary: 'Update a destination (admin)' })
  @ApiDataResponse(DestinationEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async update(@Param('id') id: string, @Body() dto: UpdateDestinationDto) {
    const destination = await this.destinationsService.update(id, dto);

    return destination;
  }

  @AdminOnly()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a destination (admin)' })
  @ApiDataResponse(DestinationEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async remove(@Param('id') id: string) {
    const destination = await this.destinationsService.remove(id);

    return destination;
  }
}
