import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigService } from '@nestjs/config'
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { PassportModule } from '@nestjs/passport'
import { LocalStrategy } from './local.strategy'

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ??
            '1d') as JwtSignOptions['expiresIn']
        }
      })
    }),
    PrismaModule,
    PassportModule
  ],
  providers: [AuthService, LocalStrategy],
  controllers: [AuthController]
})
export class AuthModule {}
