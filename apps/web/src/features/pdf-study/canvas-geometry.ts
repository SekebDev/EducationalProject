export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };

export function normalizedRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

export function viewportPoint(
  point: Point,
  width: number,
  height: number,
  rotation: number,
): Point {
  switch (normalizedRotation(rotation)) {
    case 90:
      return { x: height - point.y, y: point.x };
    case 180:
      return { x: width - point.x, y: height - point.y };
    case 270:
      return { x: point.y, y: width - point.x };
    default:
      return point;
  }
}

export function canonicalPoint(
  point: Point,
  width: number,
  height: number,
  rotation: number,
): Point {
  switch (normalizedRotation(rotation)) {
    case 90:
      return { x: point.y, y: height - point.x };
    case 180:
      return { x: width - point.x, y: height - point.y };
    case 270:
      return { x: width - point.y, y: point.x };
    default:
      return point;
  }
}

export function rotationMatrix(
  width: number,
  height: number,
  rotation: number,
): string {
  switch (normalizedRotation(rotation)) {
    case 90:
      return `matrix(0 1 -1 0 ${height} 0)`;
    case 180:
      return `matrix(-1 0 0 -1 ${width} ${height})`;
    case 270:
      return `matrix(0 -1 1 0 0 ${width})`;
    default:
      return 'matrix(1 0 0 1 0 0)';
  }
}

export function boundingRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function canonicalRect(
  rect: Rect,
  width: number,
  height: number,
  rotation: number,
): Rect {
  const converted = boundingRect(
    canonicalPoint(rect, width, height, rotation),
    canonicalPoint(
      { x: rect.x + rect.width, y: rect.y + rect.height },
      width,
      height,
      rotation,
    ),
  );
  const x = Math.max(0, Math.min(width, converted.x));
  const y = Math.max(0, Math.min(height, converted.y));
  return {
    x,
    y,
    width: Math.max(0, Math.min(width, converted.x + converted.width) - x),
    height: Math.max(0, Math.min(height, converted.y + converted.height) - y),
  };
}
