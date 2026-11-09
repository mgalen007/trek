import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApiDataResponse,
  ApiErrorResponses,
} from 'common/http/api-response.decorators';
import { apiError, ErrorCode } from 'common/http/api-error';
import { HealthEntity } from './entities/health.entity';

const DB_TIMEOUT_MS = 2_000;

// Public and never rate limited, so load balancers and orchestrators can
// poll freely.
@ApiTags('Health')
@SkipThrottle({ default: true, auth: true })
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness check',
    description:
      'The process is up and serving requests. Touches nothing else, so a database outage never gets a healthy instance restarted.',
  })
  @ApiDataResponse(HealthEntity)
  check(): HealthEntity {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check',
    description:
      'The instance can serve traffic: the database answers within 2 seconds. Returns 503 otherwise, so it should be taken out of rotation.',
  })
  @ApiDataResponse(HealthEntity)
  @ApiErrorResponses([HttpStatus.SERVICE_UNAVAILABLE], {
    [HttpStatus.SERVICE_UNAVAILABLE]:
      'A dependency is down (SERVICE_UNAVAILABLE)',
  })
  async ready(): Promise<HealthEntity> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('timed out')),
            DB_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      this.logger.warn(`Database check failed: ${String(err)}`);
      throw new ServiceUnavailableException(
        apiError(ErrorCode.SERVICE_UNAVAILABLE, 'Database is unavailable', {
          checks: { database: 'down' },
        }),
      );
    } finally {
      clearTimeout(timer);
    }

    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: 'up' },
    };
  }
}
