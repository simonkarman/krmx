import { AxialCoordinate } from '../../../src';

describe('AxialCoordinate', () => {
  it('should have correct properties', () => {
    const coordinate = new AxialCoordinate(1, 2);
    expect(coordinate.q).toBe(1);
    expect(coordinate.r).toBe(2);
  });

  it('should have correct Directions', () => {
    expect(AxialCoordinate.Zero).toEqual(new AxialCoordinate(0, 0));
  });
});
