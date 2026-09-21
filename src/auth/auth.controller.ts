import { Controller, Post, UnauthorizedException, Body } from '@nestjs/common';
import { LoginDto } from './dto/login.dto'
import { AuthService } from '../auth/auth.service'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password)
    if (!user) throw new UnauthorizedException()

    return user
  }
}
