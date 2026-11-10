import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { JobRunner } from './job-runner.service';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [JobRunner, MaintenanceService],
  exports: [JobRunner, MaintenanceService],
})
export class JobsModule {}
