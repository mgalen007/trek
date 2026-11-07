import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { apiError, ErrorCode } from 'common/http/api-error';
import {
  IssuedRefreshToken,
  RefreshTokensService,
} from './refresh-tokens.service';
import type { JwtPayload } from './types/jwt.types';
import type { User } from '../../generated/prisma/client';
import type { AuthTokensEntity } from './entities/auth-tokens.entity';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private refreshTokens: RefreshTokensService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user)
      throw new UnauthorizedException(
        apiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password'),
      );

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches)
      throw new UnauthorizedException(
        apiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password'),
      );

    const refreshToken = await this.refreshTokens.startSession(user.id);
    return this.tokens(user, refreshToken);
  }

  // The access token is signed from the current user row, so role and email
  // changes take effect on the next refresh.
  async refresh(token: string) {
    const { user, refreshToken } = await this.refreshTokens.rotate(token);
    return this.tokens(user, refreshToken);
  }

  logout(token: string) {
    return this.refreshTokens.revokeSession(token);
  }

  logoutAll(userId: string) {
    return this.refreshTokens.revokeAllSessions(userId);
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();

    // eslint-disable-next-line
    const { passwordHash, ...safeUser } = user;

    return safeUser;
  }

  private tokens(
    user: Pick<User, 'id' | 'email' | 'role'>,
    refreshToken: IssuedRefreshToken,
  ): AuthTokensEntity {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
    });
    const { iat, exp } =
      this.jwtService.decode<Required<JwtPayload>>(accessToken);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: exp - iat,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }
}
