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

  it('derives the page back from skip and limit', () => {
    expect(paginationMetadata(20, 10)).toEqual({
      page: 3,
      skip: 20,
      limit: 10,
    });
  });
});
