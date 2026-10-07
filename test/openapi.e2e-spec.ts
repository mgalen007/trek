import { ErrorCode } from '../common/http/api-error';
import { createTestApp } from './utils';

type Schema = Record<string, unknown> & {
  $ref?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
};
type Operation = {
  operationId: string;
  summary?: string;
  tags?: string[];
  security?: unknown[];
  parameters?: (Schema & { name: string; schema: Schema })[];
  responses: Record<
    string,
    { content?: { 'application/json': { schema: Schema } } }
  >;
};
type OpenApiDoc = {
  openapi: string;
  info: { title: string };
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

const PUBLIC_OPERATIONS = ['auth_login', 'auth_register'];

describe('OpenAPI docs (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let doc: OpenApiDoc;
  let operations: (Operation & { path: string })[];

  const op = (id: string) => {
    const found = operations.find((o) => o.operationId === id);
    if (!found) throw new Error(`No operation ${id}`);
    return found;
  };
  const jsonSchema = (operation: Operation, status: string) =>
    operation.responses[status].content!['application/json'].schema;

  beforeAll(async () => {
    ctx = await createTestApp();
    const res = await ctx.api().get('/api/docs-json').expect(200);
    doc = res.body as OpenApiDoc;
    operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.values(methods).map((o) => ({ ...o, path })),
    );
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('serves Swagger UI and the raw spec', async () => {
    await ctx.api().get('/api/docs').expect(200).expect('Content-Type', /html/);

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('Trek API');
  });

  it('gives every operation a unique id, a summary and a tag', () => {
    const ids = operations.map((o) => o.operationId);

    expect(new Set(ids).size).toBe(ids.length);
    for (const o of operations) {
      expect(o.operationId).toMatch(/^[a-z]+_[a-zA-Z]+$/);
      expect(o.summary).toBeTruthy();
      expect(o.tags?.length).toBeGreaterThan(0);
    }
  });

  it('requires a bearer token everywhere except login and register', () => {
    for (const o of operations) {
      const isPublic = PUBLIC_OPERATIONS.includes(o.operationId);
      expect([o.operationId, Boolean(o.security)]).toEqual([
        o.operationId,
        !isPublic,
      ]);
    }
  });

  it('resolves every schema reference', () => {
    const refs = JSON.stringify(doc).match(/#\/components\/schemas\/\w+/g);

    for (const ref of new Set(refs)) {
      expect(doc.components.schemas).toHaveProperty(ref.split('/').pop()!);
    }
  });

  it('documents the { data, pagination } envelope', () => {
    const search = jsonSchema(op('hotels_findAll'), '200');

    expect(search.properties!.data.items!.$ref).toBe(
      '#/components/schemas/HotelSearchResultEntity',
    );
    expect(search.properties!.pagination.$ref).toBe(
      '#/components/schemas/PaginationMetaDto',
    );
    expect(
      jsonSchema(op('itineraries_confirm'), '200').properties!.data.$ref,
    ).toBe('#/components/schemas/ItineraryDetailEntity');
  });

  it('documents errors with every ErrorCode', () => {
    expect(jsonSchema(op('itineraries_confirm'), '409').$ref).toBe(
      '#/components/schemas/ErrorResponseDto',
    );
    expect(doc.components.schemas.ErrorCode.enum).toEqual(
      Object.values(ErrorCode),
    );
  });

  it('derives query and body schemas from the DTOs and validators', () => {
    const params = op('hotels_findAll').parameters!;
    const param = (name: string) => params.find((p) => p.name === name)!;

    expect(param('checkIn').schema).toMatchObject({ format: 'date' });
    expect(param('sort').schema.enum).toEqual(['name', 'price', 'rating']);
    expect(param('limit').schema).toMatchObject({ minimum: 1, maximum: 100 });

    const createHotel = doc.components.schemas.CreateHotelDto;
    expect(createHotel.properties!.destinationId).toMatchObject({
      format: 'uuid',
    });
    expect(createHotel.properties!.currency).toMatchObject({
      minLength: 3,
      maxLength: 3,
    });
    expect(createHotel.required).toContain('nightlyRate');
    expect(doc.components.schemas.UpdateHotelDto.required).toBeUndefined();
  });
});
