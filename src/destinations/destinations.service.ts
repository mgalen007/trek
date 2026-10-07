import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDestinationDto } from './dto/create-destination.dto';
import { Prisma } from '../../generated/prisma/client';
import { BrowsingQueryParams } from './types/browsing.types';
import { getPaginationParams } from 'common/helpers/pagination.helpers';
import { toPage } from 'common/http/page';
import { UpdateDestinationDto } from './dto/update-destination.dto';

@Injectable()
export class DestinationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateDestinationDto) {
    const destination = await this.prisma.destination.create({ data: dto });

    return destination;
  }

  async findAll(query: BrowsingQueryParams) {
    const { skip, l: limit } = getPaginationParams(query.page, query.limit);
    const contains = (value: string) => ({
      contains: value,
      mode: 'insensitive' as const,
    });
    const where: Prisma.DestinationWhereInput = {
      name: query.name ? contains(query.name) : undefined,
      country: query.country
        ? { equals: query.country, mode: 'insensitive' }
        : undefined,
      OR: query.q
        ? [
            { name: contains(query.q) },
            { city: contains(query.q) },
            { country: contains(query.q) },
          ]
        : undefined,
    };

    const [destinations, total] = await this.prisma.$transaction([
      this.prisma.destination.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit,
        skip,
      }),
      this.prisma.destination.count({ where }),
    ]);

    return toPage(destinations, skip, limit, total);
  }

  async findOneById(id: string) {
    const destination = await this.prisma.destination.findUnique({
      where: { id },
    });
    if (!destination) throw new NotFoundException('Destination not found');

    return destination;
  }

  async update(id: string, dto: UpdateDestinationDto) {
    const destination = await this.prisma.destination.update({
      where: { id },
      data: dto,
    });

    return destination;
  }

  async remove(id: string) {
    const destination = await this.prisma.destination.delete({ where: { id } });

    return destination;
  }
}
