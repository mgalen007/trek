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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from './types/req.types';
import {
  ApiDataResponse,
  ApiErrorResponses,
} from 'common/http/api-response.decorators';
import { LoginResultEntity } from './entities/login-result.entity';
import { UserEntity } from '../users/entities/user.entity';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description: 'Exchanges email and password for a JWT bearer token.',
  })
  @ApiDataResponse(LoginResultEntity)
  @ApiErrorResponses([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED], {
    [HttpStatus.UNAUTHORIZED]: 'Wrong email or password (INVALID_CREDENTIALS)',
  })
  async login(@Body() dto: LoginDto) {
    const token = await this.authService.login(dto.email, dto.password);

    return { token };
  }

  @Post('register')
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
