export class HexDirection {
  public static readonly None = new HexDirection(-1);
  public static readonly Up = new HexDirection(0);
  public static readonly RightUp = new HexDirection(1);
  public static readonly RightDown = new HexDirection(2);
  public static readonly Down = new HexDirection(3);
  public static readonly LeftDown = new HexDirection(4);
  public static readonly LeftUp = new HexDirection(5);
  private constructor(public readonly value: number) {}
  public static inverse(direction: HexDirection): HexDirection {
    if (direction == HexDirection.None)
      return HexDirection.None;
    return new HexDirection((3 + direction.value) % 6);
  }
}
