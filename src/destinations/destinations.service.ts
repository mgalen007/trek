import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDestinationDto } from './dto/create-destination.dto';
import { PaginationQueryParams } from 'common/types/pagination.types';
import {
  getPaginationParams,
  paginationMetadata,
} from 'common/helpers/pagination.helpers';
import { UpdateDestinationDto } from './dto/update-destination.dto';

@Injectable()
export class DestinationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateDestinationDto) {
    const destination = await this.prisma.destination.create({ data: dto });

    return destination;
  }

  async findAll(options: PaginationQueryParams) {
    const { skip, l: limit } = getPaginationParams(options.page, options.limit);
    const destinations = await this.prisma.destination.findMany({
      take: limit,
      skip,
    });

    return { destinations, pagination: paginationMetadata(skip, limit) };
  }

  async findByName(name: string, options: PaginationQueryParams) {
    const { skip, l: limit } = getPaginationParams(options.page, options.limit);
    const destinations = await this.prisma.destination.findMany({
      where: { name },
      take: limit,
      skip,
    });

    return { destinations, pagination: paginationMetadata(skip, limit) };
  }

  async findOneById(id: string) {
    const destination = await this.prisma.destination.findUnique({
      where: { id },
    });
    if (!destination) throw new NotFoundException('Destinaion not found');

    return destination;
  }

  async update(id: string, dto: UpdateDestinationDto) {
    const destination = await this.prisma.destination.update({
      where: { id },
      data: dto,
    });
    if (!destination) throw new NotFoundException('Destination not found');

    return destination;
  }

  async remove(id: string) {
    const destination = await this.prisma.destination.delete({ where: { id } });
    if (!destination) throw new NotFoundException('Destination not found');

    return destination;
  }
}
