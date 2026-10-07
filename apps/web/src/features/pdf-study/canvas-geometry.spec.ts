import { describe, expect, it } from 'vitest';
import {
  boundingRect,
  canonicalPoint,
  canonicalRect,
  rotationMatrix,
  viewportPoint,
} from './canvas-geometry';

describe('PDF study coordinate geometry', () => {
  it.each([0, 90, 180, 270, -90, 450])(
    'round trips a crop-local point under %i degree rotation',
    (rotation) => {
      const canonical = { x: 54, y: 180 };
      expect(
        canonicalPoint(
          viewportPoint(canonical, 612, 792, rotation),
          612,
          792,
          rotation,
        ),
      ).toEqual(canonical);
    },
  );
  it('keeps the right and top margins after rotating a crop clockwise', () => {
    expect(viewportPoint({ x: 0, y: 0 }, 300, 500, 90)).toEqual({
      x: 500,
      y: 0,
    });
    expect(
      canonicalRect({ x: 360, y: 20, width: 40, height: 90 }, 300, 500, 90),
    ).toEqual({ x: 20, y: 100, width: 90, height: 40 });
  });
  it('uses bounding rectangles for a drag in either direction', () => {
    expect(boundingRect({ x: 80, y: 60 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 60,
      height: 50,
    });
    expect(rotationMatrix(300, 500, 270)).toBe('matrix(0 -1 1 0 0 300)');
  });
  it('clips browser selection rectangles to the visible crop', () => {
    expect(
      canonicalRect({ x: -2, y: 10, width: 40, height: 12 }, 300, 500, 0),
    ).toEqual({ x: 0, y: 10, width: 38, height: 12 });
  });
});
