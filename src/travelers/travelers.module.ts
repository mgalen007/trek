import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TravelersController } from './travelers.controller';
import { TravelersService } from './travelers.service';

@Module({
  imports: [PrismaModule],
  controllers: [TravelersController],
  providers: [TravelersService],
  exports: [TravelersService],
})
export class TravelersModule {}
