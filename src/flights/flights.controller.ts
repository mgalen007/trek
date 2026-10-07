import {
  Controller,
  UseGuards,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FlightsService } from './flights.service';
import { AdminOnly } from 'src/auth/decorators/admin-only.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateFlightDto } from './dto/create-flight.dto';
import { FlightSearchParams } from './types/flight-search.types';
import { UpdateFlightDto } from './dto/update-flight.dto';
import {
  FlightEntity,
  FlightWithAirportsEntity,
} from './entities/flight.entity';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPageResponse,
} from 'common/http/api-response.decorators';

@ApiTags('Flights')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('flights')
export class FlightsController {
  constructor(private flightService: FlightsService) {}

  @AdminOnly()
  @Post()
  @ApiOperation({ summary: 'Create a flight (admin)' })
  @ApiDataResponse(FlightEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async create(@Body() dto: CreateFlightDto) {
    const flight = await this.flightService.create(dto);

    return flight;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a flight by id',
    description: 'Works for past flights too.',
  })
  @ApiDataResponse(FlightWithAirportsEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async findOneById(@Param('id') id: string) {
    const flight = await this.flightService.findOneById(id);

    return flight;
  }

  @Get()
  @ApiOperation({
    summary: 'Search upcoming flights',
    description:
      'Filter by route (airport codes or destinations), departure day, seats needed and price. Flights that have already departed are never listed.',
  })
  @ApiPageResponse(FlightWithAirportsEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async findAll(@Query() query: FlightSearchParams) {
    const flights = await this.flightService.findAll(query);

    return flights;
  }

  @AdminOnly()
  @Put(':id')
  @ApiOperation({ summary: 'Update a flight (admin)' })
  @ApiDataResponse(FlightEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async update(@Param('id') id: string, @Body() dto: UpdateFlightDto) {
    const flight = await this.flightService.update(id, dto);

    return flight;
  }

  @AdminOnly()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a flight (admin)' })
  @ApiDataResponse(FlightEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async remove(@Param('id') id: string) {
    const flight = await this.flightService.remove(id);

    return flight;
  }
}
