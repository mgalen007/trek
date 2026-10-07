import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  UseGuards,
  Param,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AirportsService } from './airports.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AdminOnly } from 'src/auth/decorators/admin-only.decorator';
import { CreateAirportDto } from './dto/create-airport.dto';
import { AirportQueryParams } from './types/airport-query.types';
import { UpdateAirportDto } from './dto/update-airport.dto';
import { AirportEntity } from './entities/airport.entity';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPageResponse,
} from 'common/http/api-response.decorators';
import { Idempotent } from '../idempotency/idempotent.decorator';

@ApiTags('Airports')
@ApiBearerAuth()
@ApiErrorResponses([HttpStatus.UNAUTHORIZED])
@UseGuards(JwtAuthGuard)
@Controller('airports')
export class AirportsController {
  constructor(private airportService: AirportsService) {}

  @AdminOnly()
  @Post()
  @Idempotent()
  @ApiOperation({ summary: 'Create an airport (admin)' })
  @ApiDataResponse(AirportEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT], {
    [HttpStatus.CONFLICT]: 'Airport code already exists (ALREADY_EXISTS)',
  })
  async create(@Body() dto: CreateAirportDto) {
    const airport = await this.airportService.create(dto);

    return airport;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an airport by id' })
  @ApiDataResponse(AirportEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async findOneById(@Param('id') id: string) {
    const airport = await this.airportService.findOneById(id);

    return airport;
  }

  @Get()
  @ApiOperation({ summary: 'List airports, optionally by destination or code' })
  @ApiPageResponse(AirportEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async findAll(@Query() query: AirportQueryParams) {
    const airports = await this.airportService.findAll(query);

    return airports;
  }

  @AdminOnly()
  @Put(':id')
  @ApiOperation({ summary: 'Update an airport (admin)' })
  @ApiDataResponse(AirportEntity)
  @ApiErrorResponses([
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  ])
  async update(@Param('id') id: string, @Body() dto: UpdateAirportDto) {
    const airport = await this.airportService.update(id, dto);

    return airport;
  }

  @AdminOnly()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an airport (admin)' })
  @ApiDataResponse(AirportEntity)
  @ApiErrorResponses([HttpStatus.NOT_FOUND])
  async remove(@Param('id') id: string) {
    const airport = await this.airportService.remove(id);

    return airport;
  }
}
