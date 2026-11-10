import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Wraps scheduled job runs: honours SCHEDULED_JOBS=off (the e2e tests use
 * it), skips a run while the previous one is still going, and logs results
 * and failures instead of letting them escape the scheduler.
 */
@Injectable()
export class JobRunner {
  private readonly logger = new Logger('ScheduledJobs');
  private readonly running = new Set<string>();

  constructor(private config: ConfigService) {}

  async run(name: string, job: () => Promise<number>) {
    if (this.config.get<string>('SCHEDULED_JOBS') === 'off') return;
    if (this.running.has(name)) return;
    this.running.add(name);
    const started = Date.now();
    try {
      const count = await job();
      if (count)
        this.logger.log(
          `${name}: ${count} item(s) in ${Date.now() - started}ms`,
        );
    } catch (err) {
      this.logger.error(`${name} failed: ${String(err)}`);
    } finally {
      this.running.delete(name);
    }
  }
}
