import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma/client';
import { sampleDataAllowed, seedCatalogue } from './catalogue-seed';

// Adds the sample catalogue to DATABASE_URL. Run with `bun run seed:catalogue`
// (bun loads .env); Docker Compose runs it once after the migrations.
// SAMPLE_DATA_DAYS sets how many days of flights to schedule (default 90).
async function main() {
  if (!sampleDataAllowed(process.env)) {
    console.error(
      'Refusing to add sample data with NODE_ENV=production; set ALLOW_SAMPLE_DATA=true to override.',
    );
    process.exit(1);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const days = Number(process.env.SAMPLE_DATA_DAYS) || 90;
    const added = await seedCatalogue(db, { days });
    console.log(
      `Sample catalogue: added ${added.destinations} destinations, ${added.airports} airports, ${added.hotels} hotels and ${added.flights} flights (schedule: next ${days} days).`,
    );
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
