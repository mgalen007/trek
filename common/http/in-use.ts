import { ConflictException } from '@nestjs/common';
import { apiError, ErrorCode } from './api-error';

/**
 * Throws 409 RESOURCE_IN_USE when anything still references a record about
 * to be deleted, e.g. assertNotInUse('Hotel', { bookings: 2 }). The non-zero
 * counts are returned in `details`.
 */
export const assertNotInUse = (
  resource: string,
  usage: Record<string, number>,
) => {
  const used = Object.entries(usage).filter(([, count]) => count > 0);
  if (!used.length) return;

  throw new ConflictException(
    apiError(
      ErrorCode.RESOURCE_IN_USE,
      `${resource} is still referenced by ${used
        .map(([what, count]) => `${count} ${what}`)
        .join(', ')}`,
      Object.fromEntries(used),
    ),
  );
};
