import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'
import { CreateAirportDto } from './dto/create-airport.dto';
import { PaginationQueryParams } from 'common/types/pagination.types';
import { getPaginationParams } from 'common/helpers/pagination.helpers';
import { UpdateAirportDto } from './dto/update-airport.dto';


@Injectable()
export class AirportsService {
  constructor(private prisma: PrismaService) { }

  async create(dto: CreateAirportDto) {
    const airport = await this.prisma.airport.create({ data: dto })

    return airport    
  }

  async findOneById(id: string) {
    const airport = await this.prisma.airport.findUnique({ where: { id } })
    if (!airport) throw new NotFoundException('Airport not found')

    return airport
  }

  async findOneByCode(code: string) {
    const airport = await this.prisma.airport.findUnique({ where: { code } })
    if (!airport) throw new NotFoundException('Airport not found')

    return airport
  }

  async findAll(options: PaginationQueryParams) {
    const { skip, l: limit } = getPaginationParams(options.page, options.limit)
    const airports = await this.prisma.airport.findMany({
      take: limit,
      skip
    })

    return airports
  }

  async update(id: string, dto: UpdateAirportDto) {
    const airport = await this.prisma.airport.update({
      where: { id },
      data: dto
    })
    if (!airport) throw new NotFoundException('Airport not found')

    return airport
  }

  async remove(id: string) {
    const airport = await this.prisma.airport.delete({ where: { id } })
    if (!airport) throw new NotFoundException('Airport not found')

    return airport
  }
}
