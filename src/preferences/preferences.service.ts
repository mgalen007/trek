import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

const INCLUDE = { homeAirport: true };

@Injectable()
export class PreferencesService {
  constructor(private prisma: PrismaService) {}

  // Every user has preferences: the row is created with defaults on first
  // read, so callers never have to handle "not set yet".
  async get(userId: string) {
    const preferences = await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: INCLUDE,
    });

    return preferences;
  }

  // Undefined fields are ignored by Prisma, so only what was sent changes.
  async update(userId: string, dto: UpdatePreferencesDto) {
    const preferences = await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
      include: INCLUDE,
    });

    return preferences;
  }
}
