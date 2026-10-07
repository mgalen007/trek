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
} from '@nestjs/common';
import { FlightsService } from './flights.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/auth/types/auth.types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateFlightDto } from './dto/create-flight.dto';
import { FlightSearchParams } from './types/flight-search.types';
import { UpdateFlightDto } from './dto/update-flight.dto';

@UseGuards(JwtAuthGuard)
@Controller('flights')
export class FlightsController {
  constructor(private flightService: FlightsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() dto: CreateFlightDto) {
    const flight = await this.flightService.create(dto);

    return flight;
  }

  @Get(':id')
  async findOneById(@Param('id') id: string) {
    const flight = await this.flightService.findOneById(id);

    return flight;
  }

  @Get()
  async findAll(@Query() query: FlightSearchParams) {
    const flights = await this.flightService.findAll(query);

    return flights;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFlightDto) {
    const flight = await this.flightService.update(id, dto);

    return flight;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const flight = await this.flightService.remove(id);

    return flight;
  }
}
