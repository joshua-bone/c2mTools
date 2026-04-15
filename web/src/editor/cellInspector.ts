import {
  buildCellFromLayers,
  cloneTileSpec,
  flattenCellLayers,
  type C2mCellLayerName,
} from "../../../src/c2m/cellStack.js";
import type {
  Dir,
  LogicGate,
  MapJson,
  ModifierJson,
  TileSpecObjJson,
  TrackActive,
  TrackPiece,
} from "../../../src/c2m/mapCodec.js";
import { pointToIndex, type GridPoint } from "./boardGeometry.js";
import { describeTileSpec } from "./tileDisplay.js";

export const CARDINAL_DIRS: ReadonlyArray<Dir> = Object.freeze(["N", "E", "S", "W"]);
export const TRACK_PIECES: ReadonlyArray<TrackPiece> = Object.freeze([
  "TURN_NE",
  "TURN_SE",
  "TURN_SW",
  "TURN_NW",
  "HORIZONTAL",
  "VERTICAL",
  "SWITCH",
]);
export const TRACK_ACTIVE_VALUES: ReadonlyArray<TrackActive> = Object.freeze([
  "NE",
  "SE",
  "SW",
  "NW",
  "H",
  "V",
]);
export const LOGIC_GATES: ReadonlyArray<LogicGate> = Object.freeze([
  "INVERTER",
  "AND",
  "OR",
  "XOR",
  "LATCH_CW",
  "LATCH_CCW",
  "NAND",
  "COUNTER",
]);
export const CUSTOM_STYLE_VALUES: ReadonlyArray<
  Extract<ModifierJson, { kind: "CUSTOM_STYLE" }>["style"]
> = Object.freeze(["GREEN", "PINK", "YELLOW", "BLUE"]);

export type InspectableCellLayer = Readonly<{
  role: C2mCellLayerName;
  tile: TileSpecObjJson;
  label: string;
}>;

export type InspectableCell = Readonly<{
  index: number;
  point: GridPoint;
  layers: ReadonlyArray<InspectableCellLayer>;
}>;

const WIRES_TILE_NAMES = new Set<string>([
  "FLOOR",
  "RED_TELEPORT",
  "BLUE_TELEPORT",
  "TRANSMOGRIFIER",
  "STEEL_WALL",
  "SWITCH_OFF",
  "SWITCH_ON",
  "PINK_BUTTON",
  "BLACK_BUTTON",
]);

function stripLower(tile: TileSpecObjJson): TileSpecObjJson {
  const cloned = cloneTileSpec(tile);
  if (typeof cloned === "string") return { tile: cloned };

  const { lower: _lower, ...rest } = cloned;
  return rest;
}

function tilesEqual(a: TileSpecObjJson, b: TileSpecObjJson): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function modifierKindOrder(kind: ModifierJson["kind"]): number {
  switch (kind) {
    case "WIRES":
      return 0;
    case "LETTER_SYMBOL":
      return 1;
    case "CLONE_ARROWS":
      return 2;
    case "CUSTOM_STYLE":
      return 3;
    case "LOGIC":
      return 4;
    case "TRACKS":
      return 5;
  }
}

export function getTileModifier<K extends ModifierJson["kind"]>(
  tile: TileSpecObjJson,
  kind: K,
): Extract<ModifierJson, { kind: K }> | null {
  const modifier = tile.modifiers?.find(
    (entry): entry is Extract<ModifierJson, { kind: K }> => entry.kind === kind,
  );
  return modifier ?? null;
}

export function setTileModifier<K extends ModifierJson["kind"]>(
  tile: TileSpecObjJson,
  kind: K,
  modifier: Extract<ModifierJson, { kind: K }> | null,
): TileSpecObjJson {
  const nextModifiers = [...(tile.modifiers ?? []).filter((entry) => entry.kind !== kind)];
  if (modifier) nextModifiers.push(modifier);
  nextModifiers.sort((a, b) => modifierKindOrder(a.kind) - modifierKindOrder(b.kind));

  const nextTile = {
    ...stripLower(tile),
    ...(nextModifiers.length > 0 ? { modifiers: nextModifiers } : {}),
  };
  return stripLower(nextTile);
}

export function tileSupportsDirection(tile: TileSpecObjJson): boolean {
  return tile.dir !== undefined;
}

export function tileSupportsThinWallCanopy(tile: TileSpecObjJson): boolean {
  return tile.tile === "THINWALL_CANOPY" || tile.thinWallCanopy !== undefined;
}

export function tileSupportsDirectionalArrows(tile: TileSpecObjJson): boolean {
  return tile.tile === "DIRECTIONAL_BLOCK" || tile.directionalArrows !== undefined;
}

export function tileSupportsModifierKind(
  tile: TileSpecObjJson,
  kind: ModifierJson["kind"],
): boolean {
  switch (kind) {
    case "WIRES":
      return WIRES_TILE_NAMES.has(tile.tile);
    case "TRACKS":
      return tile.tile === "RAILROAD_TRACK";
    case "CLONE_ARROWS":
      return tile.tile === "CLONE_MACHINE" || tile.tile === "CLONE_MACHINE_OLD";
    case "CUSTOM_STYLE":
      return tile.tile === "CUSTOM_FLOOR" || tile.tile === "CUSTOM_WALL";
    case "LETTER_SYMBOL":
      return tile.tile === "LETTER_TILE";
    case "LOGIC":
      return tile.tile === "LOGIC_GATE";
  }
}

export function layerHasEditableProperties(tile: TileSpecObjJson): boolean {
  return (
    tileSupportsDirection(tile) ||
    tileSupportsThinWallCanopy(tile) ||
    tileSupportsDirectionalArrows(tile) ||
    tileSupportsModifierKind(tile, "WIRES") ||
    tileSupportsModifierKind(tile, "TRACKS") ||
    tileSupportsModifierKind(tile, "CLONE_ARROWS") ||
    tileSupportsModifierKind(tile, "CUSTOM_STYLE") ||
    tileSupportsModifierKind(tile, "LETTER_SYMBOL") ||
    tileSupportsModifierKind(tile, "LOGIC")
  );
}

export function resolveInspectableCell(
  map: MapJson | null,
  point: GridPoint | null,
): InspectableCell | null {
  if (!map || !point) return null;
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) return null;

  const index = pointToIndex(point, map);
  const cell = map.tiles[index];
  if (cell === undefined) return null;

  const layers = flattenCellLayers(cell);
  const orderedLayers = [
    ["thinWalls", layers.thinWalls],
    ["noSign", layers.noSign],
    ["mob", layers.mob],
    ["item", layers.item],
    ["terrain", layers.terrain],
  ] as const;

  return {
    index,
    point,
    layers: orderedLayers
      .filter(
        (entry): entry is readonly [C2mCellLayerName, TileSpecObjJson] => entry[1] !== undefined,
      )
      .map(([role, tile]) => ({
        role,
        tile,
        label: describeTileSpec(tile) ?? tile.tile,
      })),
  };
}

export function updateCellLayerAtPoint(
  map: MapJson,
  point: GridPoint,
  role: C2mCellLayerName,
  updater: (tile: TileSpecObjJson) => TileSpecObjJson,
): MapJson {
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) return map;

  const index = pointToIndex(point, map);
  const currentCell = map.tiles[index];
  if (currentCell === undefined) return map;

  const currentLayers = flattenCellLayers(currentCell);
  const layer = role === "terrain" ? currentLayers.terrain : currentLayers[role];
  if (!layer) return map;

  const nextLayer = stripLower(updater(stripLower(layer)));
  if (tilesEqual(layer, nextLayer)) return map;

  const nextCell = buildCellFromLayers({
    ...currentLayers,
    [role]: nextLayer,
  });

  const nextTiles = [...map.tiles];
  nextTiles[index] = nextCell;

  return {
    width: map.width,
    height: map.height,
    tiles: nextTiles,
  };
}
