import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

// The interceptor is applied globally in app.setup.ts (so its order relative
// to EnvelopeInterceptor is explicit); routes opt in with @Idempotent().
@Module({
  imports: [PrismaModule],
  providers: [IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}
