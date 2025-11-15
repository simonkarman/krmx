import { CubeCoordinate } from '../../../src';

describe('CubeCoordinate', () => {
  it('should have correct properties', () => {
    const coordinate = new CubeCoordinate(1, 2, 3);
    expect(coordinate.x).toBe(1);
    expect(coordinate.y).toBe(2);
    expect(coordinate.z).toBe(3);
  });
});
