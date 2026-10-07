import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { createOpenApiDocument } from '../openapi';

// Writes the OpenAPI spec to a file (default: openapi.json) for client
// generation. The app is created but never initialised, so no server starts
// and the database isn't touched; JWT_SECRET must still be set.
// Run via `bun run openapi:export` so the swagger CLI plugin has been applied.
async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  configureApp(app);

  const out = process.argv[2] ?? 'openapi.json';
  writeFileSync(
    out,
    JSON.stringify(createOpenApiDocument(app), null, 2) + '\n',
  );
  await app.close();

  console.log(`OpenAPI spec written to ${out}`);
}

void exportOpenApi();
