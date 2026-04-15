import {
  buildCellFromLayers,
  canonicalizeTileSpec,
  cloneTileSpec,
  flattenCellLayers,
  getBrushRole,
  replaceCellForBrush,
  resolveBrushRole,
} from "../../../src/c2m/cellStack.js";
import type { Dir, MapJson, TileSpecJson, TileSpecObjJson } from "../../../src/c2m/mapCodec.js";
import {
  clampPoint,
  getLineIndices,
  indexToPoint,
  pointToIndex,
  type GridPoint,
  type GridRect,
} from "./boardGeometry.js";
import { getTileModifier, resolveWireableDirections, setTileModifier } from "./cellInspector.js";

export type C2mClipboard = Readonly<{
  width: number;
  height: number;
  cells: ReadonlyArray<TileSpecJson>;
}>;

type BrushApplicationResult = Readonly<{
  tile: TileSpecJson;
  changed: boolean;
}>;

const TRACK_PIECE_ORDER = [
  "TURN_NE",
  "TURN_SE",
  "TURN_SW",
  "TURN_NW",
  "HORIZONTAL",
  "VERTICAL",
  "SWITCH",
] as const;
const CARDINAL_DIRS: ReadonlyArray<Dir> = Object.freeze(["N", "E", "S", "W"]);

function tilesEqual(a: TileSpecJson, b: TileSpecJson): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeRailroadTracks(currentTile: TileSpecJson, brush: TileSpecJson): TileSpecJson | null {
  const currentLayers = flattenCellLayers(currentTile);
  const brushLayers = flattenCellLayers(brush);
  if (
    currentLayers.terrain.tile !== "RAILROAD_TRACK" ||
    brushLayers.terrain.tile !== "RAILROAD_TRACK"
  ) {
    return null;
  }

  const currentModifier = currentLayers.terrain.modifiers?.find(
    (modifier) => modifier.kind === "TRACKS",
  );
  const brushModifier = brushLayers.terrain.modifiers?.find(
    (modifier) => modifier.kind === "TRACKS",
  );
  if (
    !currentModifier ||
    currentModifier.kind !== "TRACKS" ||
    !brushModifier ||
    brushModifier.kind !== "TRACKS"
  ) {
    return null;
  }

  const pieceSet = new Set([...currentModifier.pieces, ...brushModifier.pieces]);
  const pieces = TRACK_PIECE_ORDER.filter((piece) => pieceSet.has(piece));
  const isSwitchOnlyBrush =
    brushModifier.pieces.length === 1 && brushModifier.pieces[0] === "SWITCH";
  const nextTerrain = canonicalizeTileSpec({
    tile: "RAILROAD_TRACK",
    modifiers: [
      {
        kind: "TRACKS",
        pieces: [...pieces],
        active: isSwitchOnlyBrush ? currentModifier.active : brushModifier.active,
        entered: isSwitchOnlyBrush ? currentModifier.entered : brushModifier.entered,
      },
    ],
  });

  return buildCellFromLayers({
    ...currentLayers,
    terrain: typeof nextTerrain === "string" ? { tile: nextTerrain } : nextTerrain,
  });
}

function isSwitchOnlyRailroadBrush(brush: TileSpecJson): boolean {
  const layers = flattenCellLayers(brush);
  if (layers.terrain.tile !== "RAILROAD_TRACK") return false;
  const modifier = layers.terrain.modifiers?.find((entry) => entry.kind === "TRACKS");
  return (
    modifier?.kind === "TRACKS" && modifier.pieces.length === 1 && modifier.pieces[0] === "SWITCH"
  );
}

function mergeThinWalls(currentTile: TileSpecJson, brush: TileSpecJson): TileSpecJson | null {
  const currentLayers = flattenCellLayers(currentTile);
  const brushLayers = flattenCellLayers(brush);
  if (!brushLayers.thinWalls || brushLayers.thinWalls.tile !== "THINWALL_CANOPY") return null;
  if (!currentLayers.thinWalls || currentLayers.thinWalls.tile !== "THINWALL_CANOPY") return null;

  const wallSet = new Set([
    ...(currentLayers.thinWalls.thinWallCanopy?.walls ?? []),
    ...(brushLayers.thinWalls.thinWallCanopy?.walls ?? []),
  ]);
  const nextThinWalls: TileSpecObjJson = {
    tile: "THINWALL_CANOPY",
    thinWallCanopy: {
      walls: CARDINAL_DIRS.filter((dir) => wallSet.has(dir)),
      canopy:
        (currentLayers.thinWalls.thinWallCanopy?.canopy ?? false) ||
        (brushLayers.thinWalls.thinWallCanopy?.canopy ?? false),
    },
  };

  return buildCellFromLayers({
    ...currentLayers,
    thinWalls: nextThinWalls,
  });
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

export function clearMapToFloor(map: MapJson): MapJson {
  if (map.tiles.every((tile) => tile === "FLOOR")) {
    return map;
  }

  return {
    width: map.width,
    height: map.height,
    tiles: Array<TileSpecJson>(map.width * map.height).fill("FLOOR"),
  };
}

export function classifyBrushRole(brush: TileSpecJson) {
  return getBrushRole(brush);
}

function applyBrushToTile(tile: TileSpecJson, brush: TileSpecJson): BrushApplicationResult {
  const mergedRailroadTile = mergeRailroadTracks(tile, brush);
  if (mergedRailroadTile) {
    return {
      tile: mergedRailroadTile,
      changed: !tilesEqual(tile, mergedRailroadTile),
    };
  }

  if (isSwitchOnlyRailroadBrush(brush)) {
    return {
      tile,
      changed: false,
    };
  }

  const mergedThinWalls = mergeThinWalls(tile, brush);
  if (mergedThinWalls) {
    return {
      tile: mergedThinWalls,
      changed: !tilesEqual(tile, mergedThinWalls),
    };
  }

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

export function shiftMapWrap(map: MapJson, dx: number, dy: number): MapJson {
  const normalizedDx = ((dx % map.width) + map.width) % map.width;
  const normalizedDy = ((dy % map.height) + map.height) % map.height;
  if (normalizedDx === 0 && normalizedDy === 0) return map;

  const nextTiles = new Array<TileSpecJson>(map.tiles.length);

  for (let index = 0; index < map.tiles.length; index += 1) {
    const point = indexToPoint(index, map);
    const nextX = (point.x + normalizedDx) % map.width;
    const nextY = (point.y + normalizedDy) % map.height;
    nextTiles[nextY * map.width + nextX] = cloneTileSpec(map.tiles[index]!);
  }

  return {
    width: map.width,
    height: map.height,
    tiles: nextTiles,
  };
}

function buildNextCellAtIndex(
  map: MapJson,
  index: number,
  updater: (cell: TileSpecJson) => TileSpecJson,
): MapJson {
  const cell = map.tiles[index];
  if (cell === undefined) return map;

  const nextCell = updater(cell);
  if (tilesEqual(cell, nextCell)) return map;

  const nextTiles = [...map.tiles];
  nextTiles[index] = nextCell;
  return {
    width: map.width,
    height: map.height,
    tiles: nextTiles,
  };
}

function withWireModifier(tile: TileSpecObjJson): TileSpecObjJson {
  const existing = getTileModifier(tile, "WIRES");
  if (existing) return tile;
  return setTileModifier(tile, "WIRES", { kind: "WIRES", wires: [], tunnels: [] });
}

function getWireDirection(from: GridPoint, to: GridPoint): Dir | null {
  if (to.x === from.x && to.y === from.y - 1) return "N";
  if (to.x === from.x + 1 && to.y === from.y) return "E";
  if (to.x === from.x && to.y === from.y + 1) return "S";
  if (to.x === from.x - 1 && to.y === from.y) return "W";
  return null;
}

function oppositeDir(dir: Dir): Dir {
  return dir === "N" ? "S" : dir === "E" ? "W" : dir === "S" ? "N" : "E";
}

function sortDirs(dirs: ReadonlyArray<Dir>): Dir[] {
  const set = new Set(dirs);
  return CARDINAL_DIRS.filter((dir) => set.has(dir));
}

function addWireDir(tile: TileSpecObjJson, dir: Dir): TileSpecObjJson {
  const nextTile = withWireModifier(tile);
  const modifier = getTileModifier(nextTile, "WIRES");
  if (!modifier) return nextTile;
  return setTileModifier(nextTile, "WIRES", {
    kind: "WIRES",
    wires: sortDirs([...modifier.wires, dir]),
    tunnels: [...modifier.tunnels],
  });
}

export function canPlaceWireOnCell(cell: TileSpecJson): boolean {
  return resolveWireableDirections(flattenCellLayers(cell).terrain).length > 0;
}

export function placeWireNode(map: MapJson, point: GridPoint): MapJson {
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) return map;

  return buildNextCellAtIndex(map, pointToIndex(point, map), (cell) => {
    const layers = flattenCellLayers(cell);
    if (resolveWireableDirections(layers.terrain).length === 0) return cell;

    return buildCellFromLayers({
      ...layers,
      terrain: withWireModifier(layers.terrain),
    });
  });
}

function canWireCellDirection(cell: TileSpecJson, dir: Dir): boolean {
  return resolveWireableDirections(flattenCellLayers(cell).terrain).includes(dir);
}

export function connectWirePoints(map: MapJson, from: GridPoint, to: GridPoint): MapJson {
  const dir = getWireDirection(from, to);
  if (!dir) return map;

  const firstIndex = pointToIndex(from, map);
  const secondIndex = pointToIndex(to, map);
  const firstCell = map.tiles[firstIndex];
  const secondCell = map.tiles[secondIndex];
  if (!firstCell || !secondCell) return map;
  if (
    !canWireCellDirection(firstCell, dir) ||
    !canWireCellDirection(secondCell, oppositeDir(dir))
  ) {
    return map;
  }

  const withFirst = buildNextCellAtIndex(map, firstIndex, (cell) => {
    const layers = flattenCellLayers(cell);
    return buildCellFromLayers({
      ...layers,
      terrain: addWireDir(layers.terrain, dir),
    });
  });

  return buildNextCellAtIndex(withFirst, secondIndex, (cell) => {
    const layers = flattenCellLayers(cell);
    return buildCellFromLayers({
      ...layers,
      terrain: addWireDir(layers.terrain, oppositeDir(dir)),
    });
  });
}

function removeWireDir(tile: TileSpecObjJson, dir: Dir): TileSpecObjJson {
  const modifier = getTileModifier(tile, "WIRES");
  if (!modifier) return tile;
  return setTileModifier(tile, "WIRES", {
    kind: "WIRES",
    wires: sortDirs(modifier.wires.filter((entry) => entry !== dir)),
    tunnels: [...modifier.tunnels],
  });
}

export function disconnectWirePoints(map: MapJson, from: GridPoint, to: GridPoint): MapJson {
  const dir = getWireDirection(from, to);
  if (!dir) return map;

  const firstIndex = pointToIndex(from, map);
  const secondIndex = pointToIndex(to, map);
  const firstCell = map.tiles[firstIndex];
  const secondCell = map.tiles[secondIndex];
  if (!firstCell || !secondCell) return map;

  const withFirst = buildNextCellAtIndex(map, firstIndex, (cell) => {
    const layers = flattenCellLayers(cell);
    return buildCellFromLayers({
      ...layers,
      terrain: removeWireDir(layers.terrain, dir),
    });
  });

  return buildNextCellAtIndex(withFirst, secondIndex, (cell) => {
    const layers = flattenCellLayers(cell);
    return buildCellFromLayers({
      ...layers,
      terrain: removeWireDir(layers.terrain, oppositeDir(dir)),
    });
  });
}
