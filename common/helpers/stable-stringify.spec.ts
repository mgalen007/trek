import { stableStringify } from './stable-stringify';

describe('stableStringify', () => {
  it('ignores key order at every level', () => {
    expect(
      stableStringify({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } }),
    ).toBe(stableStringify({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }));
  });

  it('keeps array order significant', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('matches JSON.stringify for sorted input', () => {
    const value = { a: 'x', b: [true, null, 1.5], c: { d: 'é' } };
    expect(stableStringify(value)).toBe(JSON.stringify(value));
  });

  it('handles missing bodies', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(undefined)).toBe('null');
  });
});
