import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { EnvelopeInterceptor } from './envelope.interceptor';
import { toPage } from './page';

describe('EnvelopeInterceptor', () => {
  const interceptor = new EnvelopeInterceptor();
  const wrap = (body: unknown) =>
    lastValueFrom(
      interceptor.intercept(
        {} as ExecutionContext,
        {
          handle: () => of(body),
        } as CallHandler,
      ),
    );

  it('wraps single results as { data }', async () => {
    await expect(wrap({ id: 'x' })).resolves.toEqual({ data: { id: 'x' } });
  });

  it('turns a Page into { data, pagination }', async () => {
    await expect(wrap(toPage([{ id: 'x' }], 0, 15, 1))).resolves.toEqual({
      data: [{ id: 'x' }],
      pagination: { page: 1, skip: 0, limit: 15, total: 1, totalPages: 1 },
    });
  });

  it('keeps plain arrays as data without pagination', async () => {
    await expect(wrap([1, 2])).resolves.toEqual({ data: [1, 2] });
  });

  it('uses null for empty results', async () => {
    await expect(wrap(undefined)).resolves.toEqual({ data: null });
  });
});
