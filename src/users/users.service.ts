import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from '../auth/dto/register.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async create(dto: RegisterDto) {
    const password = dto.password;
    const saltRounds = Number(this.configService.getOrThrow<number>('BCRYPT_SALT_ROUNDS'))
    const hash = await bcrypt.hash(
      password,
      saltRounds,
    );

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    // eslint-disable-next-line
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async remove(id: string) {
    const user = await this.prisma.user.delete({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // eslint-disable-next-line
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
