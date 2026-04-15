import {
  canonicalizeTileSpec,
  cloneTileSpec,
  flattenCellLayers,
  getBrushRole,
  replaceCellForBrush,
  resolveBrushRole,
} from "../../../src/c2m/cellStack.js";
import type { MapJson, TileSpecJson } from "../../../src/c2m/mapCodec.js";
import {
  clampPoint,
  getLineIndices,
  indexToPoint,
  pointToIndex,
  type GridPoint,
  type GridRect,
} from "./boardGeometry.js";

export type C2mClipboard = Readonly<{
  width: number;
  height: number;
  cells: ReadonlyArray<TileSpecJson>;
}>;

type BrushApplicationResult = Readonly<{
  tile: TileSpecJson;
  changed: boolean;
}>;

function tilesEqual(a: TileSpecJson, b: TileSpecJson): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function replaceTileAtIndex(
  map: MapJson,
  index: number,
  nextTile: TileSpecJson,
  nextTiles: TileSpecJson[],
): boolean {
  const currentTile = map.tiles[index];
  if (currentTile === undefined) return false;
  if (tilesEqual(currentTile, nextTile)) return false;
  nextTiles[index] = nextTile;
  return true;
}

function buildNextMap(map: MapJson, nextTiles: TileSpecJson[]): MapJson {
  return {
    width: map.width,
    height: map.height,
    tiles: nextTiles,
  };
}

export function classifyBrushRole(brush: TileSpecJson) {
  return getBrushRole(brush);
}

function applyBrushToTile(tile: TileSpecJson, brush: TileSpecJson): BrushApplicationResult {
  const nextTile = replaceCellForBrush(tile, brush);
  return {
    tile: nextTile,
    changed: !tilesEqual(tile, nextTile),
  };
}

export function paintMapCells(
  map: MapJson,
  indices: ReadonlyArray<number>,
  brush: TileSpecJson,
): MapJson {
  const nextTiles = [...map.tiles];
  let changed = false;

  for (const index of indices) {
    if (index < 0 || index >= map.tiles.length) continue;

    const currentTile = map.tiles[index];
    if (currentTile === undefined) continue;

    const nextTile = applyBrushToTile(currentTile, brush);
    if (!nextTile.changed) continue;

    nextTiles[index] = nextTile.tile;
    changed = true;
  }

  return changed ? buildNextMap(map, nextTiles) : map;
}

export function paintMapLine(
  map: MapJson,
  start: GridPoint,
  end: GridPoint,
  brush: TileSpecJson,
): MapJson {
  return paintMapCells(map, getLineIndices(start, end, map), brush);
}

export function copyMapRegion(map: MapJson, rect: GridRect): C2mClipboard {
  const anchor = clampPoint({ x: rect.x, y: rect.y }, map);
  const width = Math.max(1, Math.min(rect.width, map.width - anchor.x));
  const height = Math.max(1, Math.min(rect.height, map.height - anchor.y));
  const cells: TileSpecJson[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = pointToIndex({ x: anchor.x + x, y: anchor.y + y }, map);
      const tile = map.tiles[index];
      if (tile === undefined) continue;
      cells.push(cloneTileSpec(tile));
    }
  }

  return {
    width,
    height,
    cells,
  };
}

export function resolveClipboardPreviewRect(
  map: MapJson,
  anchor: GridPoint,
  clipboard: Pick<C2mClipboard, "width" | "height">,
): GridRect {
  const clampedAnchor = clampPoint(anchor, map);

  return {
    x: clampedAnchor.x,
    y: clampedAnchor.y,
    width: Math.max(1, Math.min(clipboard.width, map.width - clampedAnchor.x)),
    height: Math.max(1, Math.min(clipboard.height, map.height - clampedAnchor.y)),
  };
}

export function pasteMapRegion(map: MapJson, anchor: GridPoint, clipboard: C2mClipboard): MapJson {
  const clampedAnchor = clampPoint(anchor, map);
  const nextTiles = [...map.tiles];
  let changed = false;

  for (let y = 0; y < clipboard.height; y += 1) {
    for (let x = 0; x < clipboard.width; x += 1) {
      const targetX = clampedAnchor.x + x;
      const targetY = clampedAnchor.y + y;
      if (targetX >= map.width || targetY >= map.height) continue;

      const clipboardIndex = y * clipboard.width + x;
      const clipboardTile = clipboard.cells[clipboardIndex];
      if (clipboardTile === undefined) continue;

      const targetIndex = pointToIndex({ x: targetX, y: targetY }, map);
      if (replaceTileAtIndex(map, targetIndex, cloneTileSpec(clipboardTile), nextTiles)) {
        changed = true;
      }
    }
  }

  return changed ? buildNextMap(map, nextTiles) : map;
}

export function resolveEyedropperBrush(cell: TileSpecJson): TileSpecJson {
  const layers = flattenCellLayers(cell);
  const role = resolveBrushRole(layers);

  return canonicalizeTileSpec(cloneTileSpec(role === "terrain" ? layers.terrain : layers[role]!));
}

export function resolveEyedropperBrushAtPoint(map: MapJson, point: GridPoint): TileSpecJson | null {
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) return null;

  const tile = map.tiles[pointToIndex(point, map)];
  return tile === undefined ? null : resolveEyedropperBrush(tile);
}

export function floodFillMap(map: MapJson, origin: GridPoint, brush: TileSpecJson): MapJson {
  const start = clampPoint(origin, map);
  const startIndex = pointToIndex(start, map);
  const startTile = map.tiles[startIndex];
  if (startTile === undefined) return map;

  const visited = new Set<number>();
  const queue = [startIndex];
  const fillIndices: number[] = [];

  while (queue.length > 0) {
    const index = queue.shift()!;
    if (visited.has(index)) continue;
    visited.add(index);

    const tile = map.tiles[index];
    if (tile === undefined || !tilesEqual(tile, startTile)) continue;

    fillIndices.push(index);
    const point = indexToPoint(index, map);

    if (point.x > 0) queue.push(index - 1);
    if (point.x < map.width - 1) queue.push(index + 1);
    if (point.y > 0) queue.push(index - map.width);
    if (point.y < map.height - 1) queue.push(index + map.width);
  }

  return paintMapCells(map, fillIndices, brush);
}
