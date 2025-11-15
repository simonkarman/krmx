import { hasExpectedQueryParams, ExpectedQueryParams } from '../src/utils';

describe('Krmx Utils - hasExpectedQueryParams', () => {
  const scenarios: readonly (string | undefined)[] = [
    undefined,
    '',
    '/',
    '?krmx',
    '/?krmx',
    '/abc?krmx',
    '/abc?krmx=no',
    '/abc?krmx=no&another=hello',
    '/abc?krmx=yes',
    '/abc?krmx=yes&another=hello',
  ];

  it('should always return true when expected query params is empty', () => {
    const params: ExpectedQueryParams = {};
    for (let i = 0; i < scenarios.length; i++) {
      expect(hasExpectedQueryParams(params, scenarios[i])).toBe(true);
    }
  });
  it('should return true for first three scenarios with expected value of false', () => {
    const params: ExpectedQueryParams = { krmx: false };
    for (let i = 0; i < scenarios.length; i++) {
      expect(hasExpectedQueryParams(params, scenarios[i])).toBe(i < 3);
    }
  });
  it('should return true for all except the first three scenarios with expected value of true', () => {
    const params: ExpectedQueryParams = { krmx: true };
    for (let i = 0; i < scenarios.length; i++) {
      expect(hasExpectedQueryParams(params, scenarios[i])).toBe(i >= 3);
    }
  });
  it('should return true for the last two scenarios with expected value of \'yes\'', () => {
    const params: ExpectedQueryParams = { krmx: 'yes' };
    for (let i = 0; i < scenarios.length; i++) {
      console.info('checking', scenarios[i]);
      expect(hasExpectedQueryParams(params, scenarios[i])).toBe(i >= scenarios.length - 2);
    }
  });
  it('should return true for the last two scenarios with expected value of a function expecting \'yes\'', () => {
    const params: ExpectedQueryParams = { krmx: (value: string) => value === 'yes' };
    for (let i = 0; i < scenarios.length; i++) {
      console.info('checking', scenarios[i]);
      expect(hasExpectedQueryParams(params, scenarios[i])).toBe(i >= scenarios.length - 2);
    }
  });
  it('should return true when multiple params are used', () => {
    const params: ExpectedQueryParams = {
      one: true,
      two: false,
      three: 'something',
      four: (value: string) => value.length === 4,
    };
    expect(hasExpectedQueryParams(params, '?one&three=something&four=1234')).toBe(true);
  });
});
