import { Controller, Get, Post, Put, Delete, Body, UseGuards, Param, Query } from '@nestjs/common';
import { AirportsService } from './airports.service'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/types/auth.types';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CreateAirportDto } from './dto/create-airport.dto';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { UpdateAirportDto } from './dto/update-airport.dto';


@UseGuards(JwtAuthGuard)
@Controller('airports')
export class AirportsController {
  constructor(private airportService: AirportsService) { }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() dto: CreateAirportDto) {
    const airport = await this.airportService.create(dto)

    return airport
  }

  @Get(':id')
  async findOneById(@Param('id') id: string) {
    const airport = await this.airportService.findOneById(id)

    return airport
  }

  @Get()
  async findAll(@Query() query: PaginationQueryParams) {
    const airports = await this.airportService.findAll(query)

    return airports
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAirportDto) {
    const airport = await this.airportService.update(id, dto)

    return airport
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const airport = await this.airportService.remove(id)

    return airport
  }
}
