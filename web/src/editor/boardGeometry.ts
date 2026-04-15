import type { MapJson } from "../../../src/c2m/mapCodec.js";

export type GridPoint = Readonly<{
  x: number;
  y: number;
}>;

export type GridRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueIndices(indices: ReadonlyArray<number>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();

  for (const index of indices) {
    if (seen.has(index)) continue;
    seen.add(index);
    out.push(index);
  }

  return out;
}

export function clampPoint(point: GridPoint, map: Pick<MapJson, "width" | "height">): GridPoint {
  return {
    x: clamp(point.x, 0, map.width - 1),
    y: clamp(point.y, 0, map.height - 1),
  };
}

export function pointToIndex(point: GridPoint, map: Pick<MapJson, "width">): number {
  return point.y * map.width + point.x;
}

export function indexToPoint(index: number, map: Pick<MapJson, "width">): GridPoint {
  return {
    x: index % map.width,
    y: Math.floor(index / map.width),
  };
}

export function normalizeRect(
  a: GridPoint,
  b: GridPoint,
  map: Pick<MapJson, "width" | "height">,
): GridRect {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  const clampedLeft = clamp(left, 0, map.width - 1);
  const clampedRight = clamp(right, 0, map.width - 1);
  const clampedTop = clamp(top, 0, map.height - 1);
  const clampedBottom = clamp(bottom, 0, map.height - 1);

  return {
    x: clampedLeft,
    y: clampedTop,
    width: clampedRight - clampedLeft + 1,
    height: clampedBottom - clampedTop + 1,
  };
}

export function rectToIndices(rect: GridRect, map: Pick<MapJson, "width">): number[] {
  const out: number[] = [];

  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      out.push(pointToIndex({ x: rect.x + x, y: rect.y + y }, map));
    }
  }

  return out;
}

export function getLineIndices(
  start: GridPoint,
  end: GridPoint,
  map: Pick<MapJson, "width" | "height">,
): number[] {
  const out: number[] = [];

  let x0 = start.x;
  let y0 = start.y;
  const x1 = end.x;
  const y1 = end.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    out.push(pointToIndex(clampPoint({ x: x0, y: y0 }, map), map));
    if (x0 === x1 && y0 === y1) break;

    const err2 = err * 2;
    if (err2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (err2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return uniqueIndices(out);
}
