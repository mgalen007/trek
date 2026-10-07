import { testDatabaseUrl } from './test-db';

// Runs before each test file's imports, so ConfigService and PrismaService
// pick up the test database instead of the one in .env.
process.env.DATABASE_URL = testDatabaseUrl();
