import { Random } from '../../../src';

describe('Random', () => {
  it('should return a number in range 0..1 for next', () => {
    const random = new Random('abc');
    const numbers = Array.from({ length: 100 }, () => random.next());
    expect(numbers.filter(n => n < 0 || n >= 1).length).toBe(0);
  });
  it('should return the same sequence of random values with the same seed', () => {
    const seed = 'seed';
    const random1 = new Random(seed);
    const random2 = new Random(seed);
    for (let i = 0; i < 100; i++) {
      expect(random1.next()).toBe(random2.next());
    }
  });
  it('should return different sequences of random values with different seeds', () => {
    const random1 = new Random('seed1');
    const random2 = new Random('seed2');
    const r1 = [];
    const r2 = [];
    for (let i = 0; i < 10; i++) {
      r1.push(random1.next());
      r2.push(random2.next());
    }
    expect(r1).not.toStrictEqual(r2);
  });
  it('should return true of false for bool', () => {
    const random = new Random('abc');
    const bools = Array.from({ length: 100 }, () => random.bool() as unknown);
    expect(bools.filter(b => typeof b !== 'boolean').length).toBe(0);
  });
  it('should return a number in range min..max for rangeInt', () => {
    const random = new Random('abc');
    const numbers = Array.from({ length: 100 }, () => random.rangeInt(5, 10));
    expect(numbers.filter(n => n < 5 || n > 10).length).toBe(0);
    expect(numbers.filter(n => n === 5).length).toBeGreaterThan(0);
    expect(numbers.filter(n => n === 10).length).toBeGreaterThan(0);
  });
  it('should return a number in range 0..max for rangeInt', () => {
    const random = new Random('abc');
    const numbers = Array.from({ length: 100 }, () => random.rangeInt(10));
    expect(numbers.filter(n => n < 0 || n > 10).length).toBe(0);
    expect(numbers.filter(n => n === 0).length).toBeGreaterThan(0);
    expect(numbers.filter(n => n === 10).length).toBeGreaterThan(0);
  });
  it('should return a number in range min..max for rangeInt with min > max', () => {
    const random = new Random('abc');
    const numbers = Array.from({ length: 100 }, () => random.rangeInt(10, 4));
    expect(numbers.filter(n => n < 4 || n > 10).length).toBe(0);
    expect(numbers.filter(n => n === 4).length).toBeGreaterThan(0);
    expect(numbers.filter(n => n === 10).length).toBeGreaterThan(0);
  });
  it('should return a number in range min..max with float values for rangeInt', () => {
    const random = new Random('abc');
    const numbers = Array.from({ length: 100 }, () => random.rangeInt(3.9, 9.7));
    expect(numbers.filter(n => n < 3 || n > 9).length).toBe(0);
    expect(numbers.filter(n => n === 3).length).toBeGreaterThan(0);
    expect(numbers.filter(n => n === 9).length).toBeGreaterThan(0);
  });
  it('should return a number in range min..max with negative values for rangeInt', () => {
    const random = new Random('abc');
    const numbers = Array.from({ length: 100 }, () => random.rangeInt(-9, -13));
    expect(numbers.filter(n => n < -13 || n > -9).length).toBe(0);
    expect(numbers.filter(n => n === -13).length).toBeGreaterThan(0);
    expect(numbers.filter(n => n === -9).length).toBeGreaterThan(0);
  });
  it('should shuffle an array in place', () => {
    const random = new Random('abc');
    const array = [1, 2, 3, 4, 5];
    random.shuffleArrayInPlace(array);
    expect(array).not.toStrictEqual([1, 2, 3, 4, 5]);
  });
  it('should return a new array with shuffled elements for asShuffledArray', () => {
    const random = new Random('abc');
    const array = [1, 2, 3, 4, 5];
    const shuffled = random.asShuffledArray(array);
    expect(array).toStrictEqual([1, 2, 3, 4, 5]);
    expect(shuffled).not.toStrictEqual([1, 2, 3, 4, 5]);
  });
});
