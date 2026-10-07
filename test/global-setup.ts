import { execSync } from 'child_process';
import { Client } from 'pg';
import { testDatabaseUrl } from './test-db';

// Creates the test database if needed and brings it up to date.
export default async function globalSetup() {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  if (!/^\w+$/.test(dbName) || !dbName.endsWith('_test'))
    throw new Error(`Refusing to use "${dbName}" as the e2e test database`);

  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  execSync('bunx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'inherit',
  });
}
