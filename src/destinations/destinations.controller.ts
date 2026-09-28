import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { DestinationsService } from './destinations.service'
import { CreateDestinationDto } from './dto/create-destination.dto'
import { UpdateDestinationDto } from './dto/update-destination.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from '../auth/types/auth.types'
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { BrowsingQueryParams } from './types/browsing.types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';


@UseGuards(JwtAuthGuard)
@Controller('destinations')
export class DestinationsController {
  constructor(private destinationsService: DestinationsService) { }

  @Get()
  async findAll(@Query() query: BrowsingQueryParams) {
    const { name, page = 1, limit = 15 } = query
    const paginationOptions = { page, limit }

    if (name) return this.destinationsService.findByName(name, paginationOptions)
    return this.destinationsService.findAll(paginationOptions)
  }

  @Get(':id')
  async findOneById(@Param('id') id: string) {
    const destination = await this.destinationsService.findOneById(id)

    return destination
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() dto: CreateDestinationDto) {
    const destination = await this.destinationsService.create(dto)

    return destination
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDestinationDto) {
    const destination = await this.destinationsService.update(id, dto)

    return destination
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const destination = await this.destinationsService.remove(id)

    return destination
  }
}
