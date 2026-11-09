import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from './types/req.types';
import {
  ApiDataResponse,
  ApiErrorResponses,
} from 'common/http/api-response.decorators';
import { AuthTokensEntity } from './entities/auth-tokens.entity';
import { UserEntity } from '../users/entities/user.entity';
import { Idempotent } from '../idempotency/idempotent.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { ICurrentUser } from './types/user.types';
import { StrictRateLimit } from '../rate-limit/strict-rate-limit.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('login')
  @StrictRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description:
      'Exchanges email and password for a short-lived access token and a refresh token. Each login starts a separate session.',
  })
  @ApiDataResponse(AuthTokensEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED], {
    [HttpStatus.UNAUTHORIZED]: 'Wrong email or password (INVALID_CREDENTIALS)',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the access token',
    description:
      'Exchanges a refresh token for a new access token and a new refresh token; store the new refresh token, the old one is spent. Retrying with the same token within 30 seconds (e.g. after a lost response) is safe. Presenting a spent token later is treated as theft and revokes the whole session (REFRESH_TOKEN_REUSED).',
  })
  @ApiDataResponse(AuthTokensEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED], {
    [HttpStatus.UNAUTHORIZED]:
      'Unknown, expired or revoked token (INVALID_REFRESH_TOKEN), or a spent token replayed, which revokes the session (REFRESH_TOKEN_REUSED); log in again',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the session the refresh token belongs to. Access tokens already issued stay valid until they expire. Unknown tokens are accepted, so this is always safe to retry.',
  })
  @ApiNoContentResponse({ description: 'Session ended' })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @Idempotent()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out everywhere',
    description:
      "Revokes all of the current user's sessions. Access tokens already issued stay valid until they expire.",
  })
  @ApiNoContentResponse({ description: 'All sessions ended' })
  @ApiErrorResponses([HttpStatus.UNAUTHORIZED])
  async logoutAll(@CurrentUser() user: ICurrentUser) {
    await this.authService.logoutAll(user.id);
  }

  @Post('register')
  @StrictRateLimit()
  @ApiOperation({ summary: 'Create an account' })
  @ApiDataResponse(UserEntity, { status: HttpStatus.CREATED })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT], {
    [HttpStatus.CONFLICT]: 'Email already registered (ALREADY_EXISTS)',
  })
  async register(@Body() dto: RegisterDto) {
    const user = await this.usersService.create(dto);

    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the current user's profile" })
  @ApiDataResponse(UserEntity)
  @ApiErrorResponses([HttpStatus.UNAUTHORIZED])
  async getProfile(@Request() req: AuthenticatedRequest) {
    const profile = await this.authService.getProfile(req.user.id);

    return profile;
  }
}
