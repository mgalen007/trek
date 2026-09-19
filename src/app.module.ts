import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { DestinationsModule } from './destinations/destinations.module';
import { ItinerariesModule } from './itineraries/itineraries.module';
import { HotelsModule } from './hotels/hotels.module';
import { AirportsModule } from './airports/airports.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UsersModule,
    DestinationsModule,
    ItinerariesModule,
    HotelsModule,
    AirportsModule,
    PrismaModule,
    AuthModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
