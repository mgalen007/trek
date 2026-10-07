import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { DestinationsModule } from './destinations/destinations.module';
import { ItinerariesModule } from './itineraries/itineraries.module';
import { HotelsModule } from './hotels/hotels.module';
import { AirportsModule } from './airports/airports.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SeedService } from './scripts/seed';
import { FlightsModule } from './flights/flights.module';
import { PreferencesModule } from './preferences/preferences.module';
import { TravelersModule } from './travelers/travelers.module';
import { IdempotencyModule } from './idempotency/idempotency.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UsersModule,
    DestinationsModule,
    ItinerariesModule,
    HotelsModule,
    AirportsModule,
    PrismaModule,
    AuthModule,
    FlightsModule,
    PreferencesModule,
    TravelersModule,
    IdempotencyModule,
  ],
  controllers: [AppController],
  providers: [AppService, SeedService],
})
export class AppModule {}
