import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountTokenPurpose,
  ItineraryStatus,
} from '../../generated/prisma/client';
import { apiError, ErrorCode } from 'common/http/api-error';
import { toDateOnly } from 'common/helpers/date.helpers';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from '../auth/dto/register.dto';
import type { ICurrentUser } from '../auth/types/user.types';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../auth/types/auth.types';
import * as bcrypt from 'bcryptjs';
import { outboxData, queueEmail } from '../email/email-outbox';
import { emailChangedEmail, welcomeEmail } from '../email/templates';
import { newAccountToken, queueVerification } from '../auth/account-tokens';

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
    const verification = newAccountToken(
      AccountTokenPurpose.EMAIL_VERIFICATION,
      dto.email,
      this.appUrl,
    );

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        // The welcome email carries the first verification code.
        accountTokens: { create: verification.data },
        emails: {
          create: outboxData(
            dto.email,
            welcomeEmail(dto.firstName, verification.action),
          ),
        },
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

  // A new email address starts unverified: a code goes to it, and a notice
  // to the old one so a takeover can't move the account silently.
  async update(id: string, currentUser: ICurrentUser, newUser: UpdateUserDto) {
    const before = await this.getAccessibleOrFail(id, currentUser);
    const emailChanged =
      newUser.email !== undefined && newUser.email !== before.email;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...newUser,
          ...(emailChanged ? { emailVerifiedAt: null } : {}),
        },
        omit: { passwordHash: true },
      });
      if (emailChanged) {
        await queueVerification(tx, user, this.appUrl);
        await queueEmail(
          tx,
          user.id,
          before.email,
          emailChangedEmail(before.firstName, user.email),
        );
      }
      return user;
    });
  }

  private get appUrl() {
    return this.configService.get<string>('APP_URL') || undefined;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        emailVerifiedAt: true,
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
