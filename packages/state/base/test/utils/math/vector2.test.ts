import { Vector2 } from '../../../src';

describe('Vector2', () => {
  it('should have correct properties', () => {
    const vector = new Vector2(1, 2);
    expect(vector.x).toBe(1);
    expect(vector.y).toBe(2);
  });
});
