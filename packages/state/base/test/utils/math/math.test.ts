import { approximatelyEqual } from '../../../src';

describe('approximatelyEqual', () => {
  it('should return true for equal values', () => {
    expect(approximatelyEqual(1, 1)).toBe(true);
  });

  it('should return false for different values', () => {
    expect(approximatelyEqual(1, 2)).toBe(false);
  });

  it('should return true for values within epsilon', () => {
    expect(approximatelyEqual(1, 1.001, 0.01)).toBe(true);
  });

  it('should return false for values outside epsilon', () => {
    expect(approximatelyEqual(1, 1.001, 0.0001)).toBe(false);
  });
});
