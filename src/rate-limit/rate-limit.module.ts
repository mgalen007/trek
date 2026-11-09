import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { RateLimitGuard } from './rate-limit.guard';
import { isStrictRateLimited } from './strict-rate-limit.decorator';

const MINUTE_MS = 60_000;

const perMinute = (config: ConfigService, key: string, fallback: number) => {
  const value = Number(config.get<string>(key));
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

// Counters live in memory, so each instance limits on its own. Running
// several instances needs a shared store (e.g. Redis) passed as `storage`.
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // One budget per user (or IP) across the whole API. The default key
        // includes the route, which would give every endpoint its own budget.
        generateKey: (_context, tracker, throttlerName) =>
          `${throttlerName}:${tracker}`,
        throttlers: [
          {
            name: 'default',
            ttl: MINUTE_MS,
            limit: perMinute(config, 'RATE_LIMIT_PER_MINUTE', 120),
          },
          {
            name: 'auth',
            ttl: MINUTE_MS,
            limit: perMinute(config, 'AUTH_RATE_LIMIT_PER_MINUTE', 10),
            skipIf: (context) => !isStrictRateLimited(context),
          },
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class RateLimitModule {}
