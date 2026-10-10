import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IdempotencyService,
  KEY_TTL_MS,
  LOCK_TIMEOUT_MS,
} from './idempotency.service';

const fingerprint = { method: 'POST', path: '/api/x', requestHash: 'h1' };
const taken = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: '7',
  });
const row = (overrides: object = {}) => ({
  id: 'row-1',
  ...fingerprint,
  responseBody: { data: { id: 'trip' } },
  completedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});
const ago = (ms: number) => new Date(Date.now() - ms);

describe('IdempotencyService', () => {
  let db: {
    idempotencyKey: {
      create: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: IdempotencyService;

  beforeEach(() => {
    db = {
      idempotencyKey: {
        create: jest.fn().mockResolvedValue({ id: 'new-row' }),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new IdempotencyService(db as unknown as PrismaService);
  });

  const claim = () => service.claim('user-1', 'key-1', fingerprint);

  it('claims an unused key', async () => {
    await expect(claim()).resolves.toEqual({ kind: 'new', id: 'new-row' });
  });

  it('replays a completed request', async () => {
    db.idempotencyKey.create.mockRejectedValueOnce(taken());
    db.idempotencyKey.findUnique.mockResolvedValue(row());

    await expect(claim()).resolves.toEqual({
      kind: 'replay',
      body: { data: { id: 'trip' } },
    });
  });

  it.each([
    ['method', { method: 'PUT' }],
    ['path', { path: '/api/y' }],
    ['body', { requestHash: 'h2' }],
  ])('rejects a key reused with a different %s', async (_field, diff) => {
    db.idempotencyKey.create.mockRejectedValueOnce(taken());
    db.idempotencyKey.findUnique.mockResolvedValue(row(diff));

    await expect(claim()).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('reports a request that is still running', async () => {
    db.idempotencyKey.create.mockRejectedValueOnce(taken());
    db.idempotencyKey.findUnique.mockResolvedValue(
      row({ completedAt: null, createdAt: ago(1000) }),
    );

    await expect(claim()).rejects.toBeInstanceOf(ConflictException);
  });

  it('takes over a key whose request died', async () => {
    db.idempotencyKey.create.mockRejectedValueOnce(taken());
    db.idempotencyKey.findUnique.mockResolvedValue(
      row({ completedAt: null, createdAt: ago(LOCK_TIMEOUT_MS + 1000) }),
    );

    await expect(claim()).resolves.toEqual({ kind: 'new', id: 'new-row' });
    expect(db.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { id: 'row-1' },
    });
  });

  it('runs again once a completed key has expired', async () => {
    db.idempotencyKey.create.mockRejectedValueOnce(taken());
    db.idempotencyKey.findUnique.mockResolvedValue(
      row({ createdAt: ago(KEY_TTL_MS + 1000) }),
    );

    await expect(claim()).resolves.toEqual({ kind: 'new', id: 'new-row' });
  });

  it('retries when the key is released between insert and read', async () => {
    db.idempotencyKey.create.mockRejectedValueOnce(taken());
    db.idempotencyKey.findUnique.mockResolvedValue(null);

    await expect(claim()).resolves.toEqual({ kind: 'new', id: 'new-row' });
    expect(db.idempotencyKey.create).toHaveBeenCalledTimes(2);
  });

  it('rethrows unexpected database errors', async () => {
    const boom = new Error('connection lost');
    db.idempotencyKey.create.mockRejectedValue(boom);

    await expect(claim()).rejects.toBe(boom);
  });

  it('stores responses as plain JSON', async () => {
    await service.complete('row-1', {
      data: { total: new Prisma.Decimal('12.50'), at: new Date(0) },
    });

    const [{ data }] = db.idempotencyKey.update.mock.calls[0] as [
      { data: { responseBody: unknown; completedAt: Date } },
    ];
    expect(data.responseBody).toEqual({
      data: { total: '12.5', at: '1970-01-01T00:00:00.000Z' },
    });
    expect(data.completedAt).toBeInstanceOf(Date);
  });
});
