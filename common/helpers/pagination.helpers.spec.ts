import { getPaginationParams, paginationMetadata } from './pagination.helpers';

describe('pagination helpers', () => {
  it.each([
    [undefined, undefined, { skip: 0, l: 15 }],
    [1, 5, { skip: 0, l: 5 }],
    [2, 10, { skip: 10, l: 10 }],
    [3, undefined, { skip: 30, l: 15 }],
  ])('page %p, limit %p -> %p', (page, limit, expected) => {
    expect(getPaginationParams(page, limit)).toEqual(expected);
  });

  it('derives the page and page count from skip, limit and total', () => {
    expect(paginationMetadata(20, 10, 25)).toEqual({
      page: 3,
      skip: 20,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it('reports zero pages for an empty result', () => {
    expect(paginationMetadata(0, 15, 0)).toMatchObject({
      total: 0,
      totalPages: 0,
    });
  });
});
