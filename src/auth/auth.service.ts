import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException();

    const matches = await bcrypt.compare(password, user.passwordHash)
    if (!matches) throw new UnauthorizedException()

    const { email: userEmail, firstName, lastName } = user
    const token = this.jwtService.sign(
      { userEmail, firstName, lastName },
      { secret: this.configService.getOrThrow<string>('JWT_SECRET') }
    )

    return token
  }
}
