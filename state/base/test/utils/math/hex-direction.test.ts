import { HexDirection } from '../../../src';

describe('HexDirection', () => {
  it('should have correct properties', () => {
    expect(HexDirection.None.value).toBe(-1);
    expect(HexDirection.Up.value).toBe(0);
    expect(HexDirection.RightUp.value).toBe(1);
    expect(HexDirection.RightDown.value).toBe(2);
    expect(HexDirection.Down.value).toBe(3);
    expect(HexDirection.LeftDown.value).toBe(4);
    expect(HexDirection.LeftUp.value).toBe(5);
  });
});
