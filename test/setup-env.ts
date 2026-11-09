import { testDatabaseUrl } from './test-db';

// Runs before each test file's imports, so ConfigService and PrismaService
// pick up the test database instead of the one in .env.
process.env.DATABASE_URL = testDatabaseUrl();

// The suites fire many requests from one IP; hardening.e2e-spec.ts boots
// its own apps with low limits to test rate limiting itself.
process.env.RATE_LIMIT_PER_MINUTE = '100000';
process.env.AUTH_RATE_LIMIT_PER_MINUTE = '100000';
