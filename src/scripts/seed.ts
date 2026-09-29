import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const adminCount = await this.prisma.user.count({
      where: { role: 'ADMIN' },
    });

    if (adminCount >= 1) {
      this.logger.log('Database already has an admin. Skipping seed');
      return;
    }

    try {
      const seedAdminPassword = this.configService.getOrThrow<string>(
        'SEED_ADMIN_PASSWORD',
      );
      const seedAdminFirstName = this.configService.getOrThrow<string>(
        'SEED_ADMIN_FIRST_NAME',
      );
      const seedAdminLastName = this.configService.getOrThrow<string>(
        'SEED_ADMIN_LAST_NAME',
      );
      const seedAdminEmail =
        this.configService.getOrThrow<string>('SEED_ADMIN_EMAIL');
      const seedAdminHash = await bcrypt.hash(
        seedAdminPassword,
        Number(this.configService.getOrThrow<number>('BCRYPT_SALT_ROUNDS')),
      );

      await this.prisma.user.create({
        data: {
          email: seedAdminEmail,
          role: 'ADMIN',
          firstName: seedAdminFirstName,
          lastName: seedAdminLastName,
          passwordHash: seedAdminHash,
        },
      });

      this.logger.log('Successfully seeded admin account');
    } catch (err) {
      this.logger.error('Failed to seed: ' + err);
    }
  }
}
