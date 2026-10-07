import { paginationMetadata } from '../helpers/pagination.helpers';

export type PaginationMeta = ReturnType<typeof paginationMetadata>;

// A page of list results. EnvelopeInterceptor turns it into
// `{ data, pagination }`; anything else a controller returns becomes `{ data }`.
export class Page<T> {
  constructor(
    readonly data: T[],
    readonly pagination: PaginationMeta,
  ) {}
}

export const toPage = <T>(
  data: T[],
  skip: number,
  limit: number,
  total: number,
) => new Page(data, paginationMetadata(skip, limit, total));
