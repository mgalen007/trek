import { Controller, Post, HttpCode, HttpStatus, Body } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const token = await this.authService.login(dto.email, dto.password);

    return {
      message: 'Login successful',
      data: { token }
    }
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const user = await this.usersService.create(dto);

    return {
      message: 'User registered successfully',
      data: { user }
    }
  }
}
