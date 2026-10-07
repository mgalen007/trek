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
} from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/types/auth.types';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { HotelSearchParams } from './types/hotel-search.types';
import { UpdateHotelDto } from './dto/update-hotel.dto';

@UseGuards(JwtAuthGuard)
@Controller('hotels')
export class HotelsController {
  constructor(private hotelsService: HotelsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() dto: CreateHotelDto) {
    const hotel = await this.hotelsService.create(dto);

    return hotel;
  }

  @Get()
  async findAll(@Query() query: HotelSearchParams) {
    const hotels = await this.hotelsService.findAll(query);

    return hotels;
  }

  @Get(':id')
  async findOneById(@Param('id') id: string) {
    const hotel = await this.hotelsService.findOneById(id);

    return hotel;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateHotelDto) {
    const hotel = await this.hotelsService.update(id, dto);

    return hotel;
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const hotel = await this.hotelsService.remove(id);

    return hotel;
  }
}
