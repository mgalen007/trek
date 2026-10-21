import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ItineraryStatus } from '../../generated/prisma/client';
import { apiError, ErrorCode } from 'common/http/api-error';
import { toDateOnly } from 'common/helpers/date.helpers';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from '../auth/dto/register.dto';
import type { ICurrentUser } from '../auth/types/user.types';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../auth/types/auth.types';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async create(dto: RegisterDto) {
    const password = dto.password;
    const saltRounds = Number(
      this.configService.getOrThrow<number>('BCRYPT_SALT_ROUNDS'),
    );
    const hash = await bcrypt.hash(password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      omit: {
        passwordHash: true,
      },
    });

    return user;
  }

  // Deleting a user deletes their itineraries, travelers and preferences.
  // Upcoming confirmed trips would lose their reserved rooms and seats, so
  // those must be cancelled first.
  async remove(id: string, currentUser: ICurrentUser) {
    await this.getAccessibleOrFail(id, currentUser);

    const activeTrips = await this.prisma.itinerary.count({
      where: {
        userId: id,
        status: ItineraryStatus.PLANNED,
        endDate: { gte: toDateOnly(new Date()) },
      },
    });
    if (activeTrips)
      throw new ConflictException(
        apiError(
          ErrorCode.HAS_ACTIVE_BOOKINGS,
          `User has ${activeTrips} upcoming confirmed itinerary(ies); cancel them first`,
        ),
      );

    const user = await this.prisma.user.delete({
      where: { id },
      omit: { passwordHash: true },
    });

    return user;
  }

  async update(id: string, currentUser: ICurrentUser, newUser: UpdateUserDto) {
    await this.getAccessibleOrFail(id, currentUser);

    const user = await this.prisma.user.update({
      where: { id },
      data: { ...newUser },
      omit: { passwordHash: true },
    });
    return user;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return users;
  }

  async findOneById(id: string, currentUser: ICurrentUser) {
    return this.getAccessibleOrFail(id, currentUser);
  }

  // Users can only see and change themselves (admins: anyone). Other users
  // are reported as missing rather than forbidden, so ids can't be probed.
  private async getAccessibleOrFail(id: string, currentUser: ICurrentUser) {
    if (currentUser.id !== id && currentUser.role !== Role.ADMIN)
      throw new NotFoundException('User not found');

    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return user;
  }
}
