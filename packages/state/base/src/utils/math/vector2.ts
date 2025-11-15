import { approximatelyEqual } from './float';

export class Vector2 {
  public static readonly Zero = new Vector2(0, 0);
  public static readonly Up = new Vector2(0, +1);
  public static readonly Right = new Vector2(+1, 0);
  public static readonly Down = new Vector2(0, -1);
  public static readonly Left = new Vector2(-1, 0);
  public static readonly Directions = [
    Vector2.Up, Vector2.Right, Vector2.Down, Vector2.Left,
  ];
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {
  }
  public get length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  public static add(a: Vector2, b: Vector2) {
    return new Vector2(a.x + b.x, a.y + b.y);
  }
  public static subtract(a: Vector2, b: Vector2) {
    return new Vector2(a.x - b.x, a.y - b.y);
  }
  public static approximatelyEqual(a: Vector2, b: Vector2, epsilon = 0.001) {
    return (approximatelyEqual(a.x, b.x, epsilon) && approximatelyEqual(a.y, b.y, epsilon));
  }
  public static multiply(a: Vector2, s: number) {
    return new Vector2(a.x * s, a.y * s);
  }
  public static distance(a: Vector2, b: Vector2) {
    const xDiff = Math.abs(a.x - b.x);
    const yDiff = Math.abs(a.y - b.y);
    return Math.sqrt(xDiff * xDiff + yDiff * yDiff);
  }
  public static fromDegrees(degrees: number) {
    const radians = Math.PI / 180 * degrees;
    return new Vector2(Math.cos(radians), Math.sin(radians));
  }
  public add(other: Vector2) {
    return Vector2.add(this, other);
  }
  public subtract(other: Vector2) {
    return Vector2.subtract(this, other);
  }
  public approximatelyEqual(other: Vector2, epsilon = 0.001) {
    return Vector2.approximatelyEqual(this, other, epsilon);
  }
  public multiply(s: number) {
    return Vector2.multiply(this, s);
  }
  public rounded() {
    return new Vector2(
      Math.round(this.x),
      Math.round(this.y),
    );
  }
  public toString() {
    return `Vector2(${this.x}, ${this.y})`;
  }
  public toSvgString() {
    return `${this.x},${this.y}`;
  }
  public distance(other: Vector2) {
    return Vector2.distance(this, other);
  }
  public angle() {
    return Math.atan2(this.y, this.x) * (180.0 / Math.PI);
  }
  public normalized(): Vector2 {
    const length = this.length;
    return new Vector2(this.x / length, this.y / length);
  }
  public static dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
  }
}
