import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Body,
  UseGuards,
  Request,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/account.dto';
import { AccountService } from './account.service';
import { AgentTokenEntity } from './entities/agent-token.entity';
import { AgentAllowed } from './decorators/agent-allowed.decorator';
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
import { RefreshCookieService } from './refresh-cookie.service';
import { apiError, ErrorCode } from 'common/http/api-error';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private account: AccountService,
    private refreshCookie: RefreshCookieService,
  ) {}

  @Post('login')
  @StrictRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description:
      'Exchanges email and password for a short-lived access token and a refresh token. Each login starts a separate session. The refresh token is also set as the httpOnly `trek_refresh` cookie, for browsers.',
  })
  @ApiDataResponse(AuthTokensEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED], {
    [HttpStatus.UNAUTHORIZED]: 'Wrong email or password (INVALID_CREDENTIALS)',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto.email, dto.password);
    this.refreshCookie.set(
      res,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );
    return tokens;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the access token',
    description:
      'Exchanges a refresh token for a new access token and a new refresh token; store the new refresh token, the old one is spent. Send it in the body, or (browsers) leave the body empty to use the `trek_refresh` cookie, which is renewed too. Retrying with the same token within 30 seconds (e.g. after a lost response) is safe. Presenting a spent token later is treated as theft and revokes the whole session (REFRESH_TOKEN_REUSED).',
  })
  @ApiDataResponse(AuthTokensEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED], {
    [HttpStatus.UNAUTHORIZED]:
      'No token, or an unknown, expired or revoked one (INVALID_REFRESH_TOKEN), or a spent token replayed, which revokes the session (REFRESH_TOKEN_REUSED); log in again',
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto?.refreshToken ?? this.refreshCookie.read(req);
    try {
      if (!token)
        throw new UnauthorizedException(
          apiError(
            ErrorCode.INVALID_REFRESH_TOKEN,
            'No refresh token in the body or the trek_refresh cookie; log in again',
          ),
        );
      const tokens = await this.authService.refresh(token);
      this.refreshCookie.set(
        res,
        tokens.refreshToken,
        tokens.refreshTokenExpiresAt,
      );
      return tokens;
    } catch (err) {
      // A dead token shouldn't stay in the browser to be retried forever.
      if (err instanceof UnauthorizedException) this.refreshCookie.clear(res);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the session the refresh token belongs to (from the body, or the `trek_refresh` cookie) and clears the cookie. Access tokens already issued stay valid until they expire. Unknown or missing tokens are accepted, so this is always safe to retry.',
  })
  @ApiNoContentResponse({ description: 'Session ended' })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto?.refreshToken ?? this.refreshCookie.read(req);
    if (token) await this.authService.logout(token);
    this.refreshCookie.clear(res);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @Idempotent()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out everywhere',
    description:
      "Revokes all of the current user's sessions and clears this browser's `trek_refresh` cookie. Access tokens already issued stay valid until they expire.",
  })
  @ApiNoContentResponse({ description: 'All sessions ended' })
  @ApiErrorResponses([HttpStatus.UNAUTHORIZED])
  async logoutAll(
    @CurrentUser() user: ICurrentUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id);
    this.refreshCookie.clear(res);
  }

  // Not @Idempotent: the idempotency store would keep a hash of a body
  // holding passwords, and the response holds fresh tokens.
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @StrictRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password',
    description:
      'Checks the current password and sets a new one. Every session is revoked (access tokens already issued stay valid until they expire) and a new one is returned. The owner is notified by email.',
  })
  @ApiDataResponse(AuthTokensEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED], {
    [HttpStatus.BAD_REQUEST]:
      'Current password is wrong (INVALID_CREDENTIALS), or invalid input (VALIDATION_FAILED)',
  })
  async changePassword(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    this.refreshCookie.set(
      res,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );
    return tokens;
  }

  @Post('forgot-password')
  @StrictRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request a password reset',
    description:
      'Emails a single-use reset code, valid for 1 hour, if the address has an account. Always answers 204, so it reveals nothing about which addresses are registered. At most one email per minute per account.',
  })
  @ApiNoContentResponse({ description: 'Request accepted' })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST])
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.account.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @StrictRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset the password with an emailed code',
    description:
      'Sets a new password and signs out every session; log in again afterwards. Also verifies the email address, since the code proves access to it.',
  })
  @ApiNoContentResponse({ description: 'Password changed' })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST], {
    [HttpStatus.BAD_REQUEST]:
      'Code is invalid, expired or used (INVALID_RESET_TOKEN), or invalid input (VALIDATION_FAILED)',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.account.resetPassword(dto.token, dto.newPassword);
  }

  @Post('verify-email')
  @StrictRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Verify the email address with an emailed code',
    description:
      'Codes are sent on registration, on email change and on request, and are valid for 48 hours for the address they were sent to.',
  })
  @ApiNoContentResponse({ description: 'Email verified' })
  @ApiErrorResponses([HttpStatus.BAD_REQUEST], {
    [HttpStatus.BAD_REQUEST]:
      'Code is invalid, expired, used or for an old address (INVALID_VERIFICATION_TOKEN), or invalid input (VALIDATION_FAILED)',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.account.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @Idempotent()
  @StrictRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend the verification email',
    description:
      'Sends a new code to the current address. At most one email per minute; extra requests are accepted but send nothing.',
  })
  @ApiNoContentResponse({ description: 'Request accepted' })
  @ApiErrorResponses([HttpStatus.UNAUTHORIZED, HttpStatus.CONFLICT], {
    [HttpStatus.CONFLICT]: 'Already verified (EMAIL_ALREADY_VERIFIED)',
  })
  async resendVerification(@CurrentUser() user: ICurrentUser) {
    await this.account.resendVerification(user.id);
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

  // Not @Idempotent: the idempotency store would keep the token it returns.
  // Agent tokens can't call this (deny by default), so an agent can't extend
  // its own access.
  @Post('agent-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get a token for the user's AI agent",
    description:
      "Called by the web app with the user's own access token; the agent service then uses the returned token for its tool calls. It acts as this user but can only search, read and edit draft itineraries (operations marked x-agent-allowed); confirming, cancelling and account changes stay with the user. It never carries admin rights. Expires after AGENT_TOKEN_EXPIRES_IN (default 15 minutes); there's no refresh token, request a new one instead.",
  })
  @ApiDataResponse(AgentTokenEntity)
  @ApiErrorResponses([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN], {
    [HttpStatus.FORBIDDEN]: 'Called with an agent token (AGENT_NOT_ALLOWED)',
  })
  agentToken(@CurrentUser() user: ICurrentUser) {
    return this.authService.agentToken(user);
  }

  @UseGuards(JwtAuthGuard)
  @AgentAllowed()
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
