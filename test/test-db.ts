import 'dotenv/config';

// E2E tests never touch the dev database: they use TEST_DATABASE_URL, or
// DATABASE_URL with "_test" appended to the database name.
export function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set');

  const url = new URL(base);
  const name = url.pathname.slice(1);
  url.pathname = '/' + (name.endsWith('_test') ? name : `${name}_test`);

  return url.toString();
}
