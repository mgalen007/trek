import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginationQueryParams } from 'common/types/pagination.types';
import {
  getPaginationParams,
  paginationMetadata,
} from 'common/helpers/pagination.helpers';

@Injectable()
export class HotelsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateHotelDto) {
    const hotel = await this.prisma.hotel.create({ data: dto });

    return hotel;
  }

  async findOneById(id: string) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw new NotFoundException('Hotel not found');

    return hotel;
  }

  async findAll(options: PaginationQueryParams) {
    const { skip, l: limit } = getPaginationParams(options.page, options.limit);
    const hotels = await this.prisma.hotel.findMany({
      take: limit,
      skip,
    });

    return { hotels, pagination: paginationMetadata(skip, limit) };
  }

  async update(id: string, dto: UpdateHotelDto) {
    const hotel = await this.prisma.hotel.update({
      where: { id },
      data: dto,
    });

    return hotel;
  }

  async remove(id: string) {
    const hotel = await this.prisma.hotel.delete({ where: { id } });

    return hotel;
  }
}
