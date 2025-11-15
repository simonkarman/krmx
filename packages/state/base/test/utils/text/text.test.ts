import { capitalize, enumerate } from '../../../src';

describe('Text', () => {
  it('should capitalize a string', () => {
    expect(capitalize('')).toBe('');
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('HELLO')).toBe('HELLO');
    expect(capitalize('helloWorld')).toBe('HelloWorld');
  });
  it('should enumerate a list of strings', () => {
    expect(enumerate([])).toBe('');
    expect(enumerate(['a'])).toBe('a');
    expect(enumerate(['a', 'b'])).toBe('a and b');
    expect(enumerate(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
