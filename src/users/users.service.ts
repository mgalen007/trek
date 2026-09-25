import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  async remove(id: string, currentUser: ICurrentUser) {
    if (!(currentUser.role === Role.ADMIN) && currentUser.id !== id) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.delete({
      where: { id },
      omit: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async update(id: string, currentUser: ICurrentUser, newUser: UpdateUserDto) {
    if (currentUser.id !== id && currentUser.role !== Role.ADMIN)
      throw new UnauthorizedException();

    const user = await this.prisma.user.update({
      where: { id },
      data: { ...newUser },
      omit: { passwordHash: true },
    });
    return user;
  }

  async getUsers() {
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

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return user;
  }
}
