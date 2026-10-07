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
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HotelsService } from './hotels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { HotelSearchParams } from './types/hotel-search.types';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { HotelEntity, HotelSearchResultEntity } from './entities/hotel.entity';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPageResponse,
} from 'common/http/api-response.decorators';

@ApiTags('Hotels')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('hotels')
export class HotelsController {
  constructor(private hotelsService: HotelsService) {}

  @AdminOnly()
  @Post()
  @ApiOperation({ summary: 'Create a hotel (admin)' })
  @ApiDataResponse(HotelEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async create(@Body() dto: CreateHotelDto) {
    const hotel = await this.hotelsService.create(dto);

    return hotel;
  }

  @Get()
  @ApiOperation({
    summary: 'Search hotels',
    description:
      'Filter by destination, price, currency and rating. Pass `checkIn` and `checkOut` (and optionally `rooms`) to get only hotels with free rooms for those nights; each result then includes `availableRooms`.',
  })
  @ApiPageResponse(HotelSearchResultEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async findAll(@Query() query: HotelSearchParams) {
    const hotels = await this.hotelsService.findAll(query);

    return hotels;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a hotel by id' })
  @ApiDataResponse(HotelEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async findOneById(@Param('id') id: string) {
    const hotel = await this.hotelsService.findOneById(id);

    return hotel;
  }

  @AdminOnly()
  @Put(':id')
  @ApiOperation({ summary: 'Update a hotel (admin)' })
  @ApiDataResponse(HotelEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND])
  async update(@Param('id') id: string, @Body() dto: UpdateHotelDto) {
    const hotel = await this.hotelsService.update(id, dto);

    return hotel;
  }

  @AdminOnly()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a hotel (admin)' })
  @ApiDataResponse(HotelEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async remove(@Param('id') id: string) {
    const hotel = await this.hotelsService.remove(id);

    return hotel;
  }
}
