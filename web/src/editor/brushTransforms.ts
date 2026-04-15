import { canonicalizeTileSpec } from "../../../src/c2m/cellStack.js";
import type {
  Dir,
  ModifierJson,
  TileSpecJson,
  TileSpecObjJson,
  TrackActive,
  TrackPiece,
} from "../../../src/c2m/mapCodec.js";

export type BrushCycleDirection = "clockwise" | "counterclockwise";

const DIR_ORDER: ReadonlyArray<Dir> = Object.freeze(["N", "E", "S", "W"]);
const TRACK_PIECE_ORDER: ReadonlyArray<TrackPiece> = Object.freeze([
  "TURN_NE",
  "TURN_SE",
  "TURN_SW",
  "TURN_NW",
  "HORIZONTAL",
  "VERTICAL",
  "SWITCH",
]);
const CUSTOM_STYLE_ORDER: ReadonlyArray<Extract<ModifierJson, { kind: "CUSTOM_STYLE" }>["style"]> =
  Object.freeze(["GREEN", "PINK", "YELLOW", "BLUE"]);
const LETTER_SYMBOL_ORDER: ReadonlyArray<string> = Object.freeze([
  "↑",
  "→",
  "↓",
  "←",
  ...Array.from({ length: 0x5f - 0x20 + 1 }, (_, index) => String.fromCharCode(0x20 + index)),
]);

function toTileSpecObj(spec: TileSpecJson): TileSpecObjJson {
  return typeof spec === "string" ? { tile: spec } : spec;
}

function rotateDir(dir: Dir, direction: BrushCycleDirection): Dir {
  const index = DIR_ORDER.indexOf(dir);
  const offset = direction === "clockwise" ? 1 : -1;
  return DIR_ORDER[(index + offset + DIR_ORDER.length) % DIR_ORDER.length] ?? dir;
}

function sortDirsUnique(dirs: ReadonlyArray<Dir>): Dir[] {
  const set = new Set(dirs);
  return DIR_ORDER.filter((dir) => set.has(dir));
}

function rotateTrackPiece(piece: TrackPiece, direction: BrushCycleDirection): TrackPiece {
  if (piece === "SWITCH") return piece;
  if (piece === "HORIZONTAL" || piece === "VERTICAL") {
    return piece === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
  }

  switch (piece) {
    case "TURN_NE":
      return direction === "clockwise" ? "TURN_SE" : "TURN_NW";
    case "TURN_SE":
      return direction === "clockwise" ? "TURN_SW" : "TURN_NE";
    case "TURN_SW":
      return direction === "clockwise" ? "TURN_NW" : "TURN_SE";
    case "TURN_NW":
      return direction === "clockwise" ? "TURN_NE" : "TURN_SW";
  }
}

function sortTrackPiecesUnique(pieces: ReadonlyArray<TrackPiece>): TrackPiece[] {
  const set = new Set(pieces);
  return TRACK_PIECE_ORDER.filter((piece) => set.has(piece));
}

function rotateTrackActive(active: TrackActive, direction: BrushCycleDirection): TrackActive {
  switch (active) {
    case "NE":
      return direction === "clockwise" ? "SE" : "NW";
    case "SE":
      return direction === "clockwise" ? "SW" : "NE";
    case "SW":
      return direction === "clockwise" ? "NW" : "SE";
    case "NW":
      return direction === "clockwise" ? "NE" : "SW";
    case "H":
      return "V";
    case "V":
      return "H";
  }
}

function rotateSymbol(symbol: string, direction: BrushCycleDirection): string {
  const index = LETTER_SYMBOL_ORDER.indexOf(symbol);
  const offset = direction === "clockwise" ? 1 : -1;
  if (index < 0) return LETTER_SYMBOL_ORDER[0] ?? symbol;
  return (
    LETTER_SYMBOL_ORDER[
      (index + offset + LETTER_SYMBOL_ORDER.length) % LETTER_SYMBOL_ORDER.length
    ] ?? symbol
  );
}

function cycleCustomStyle(
  style: Extract<ModifierJson, { kind: "CUSTOM_STYLE" }>["style"],
  direction: BrushCycleDirection,
): Extract<ModifierJson, { kind: "CUSTOM_STYLE" }>["style"] {
  const index = CUSTOM_STYLE_ORDER.indexOf(style);
  const offset = direction === "clockwise" ? 1 : -1;
  if (index < 0) return CUSTOM_STYLE_ORDER[0] ?? style;
  return (
    CUSTOM_STYLE_ORDER[(index + offset + CUSTOM_STYLE_ORDER.length) % CUSTOM_STYLE_ORDER.length] ??
    style
  );
}

function mapModifier(modifier: ModifierJson, direction: BrushCycleDirection): ModifierJson {
  switch (modifier.kind) {
    case "TRACKS":
      return {
        kind: "TRACKS",
        pieces: sortTrackPiecesUnique(
          modifier.pieces.map((piece) => rotateTrackPiece(piece, direction)),
        ),
        active: rotateTrackActive(modifier.active, direction),
        entered: rotateDir(modifier.entered, direction),
      };
    case "CLONE_ARROWS":
      return {
        kind: "CLONE_ARROWS",
        arrows: sortDirsUnique(modifier.arrows.map((dir) => rotateDir(dir, direction))),
      };
    case "LOGIC":
      return modifier.gate === "COUNTER"
        ? modifier
        : {
            ...modifier,
            facing: rotateDir(modifier.facing ?? "N", direction),
          };
    case "LETTER_SYMBOL":
      return {
        kind: "LETTER_SYMBOL",
        symbol: rotateSymbol(modifier.symbol, direction),
      };
    case "CUSTOM_STYLE":
      return {
        kind: "CUSTOM_STYLE",
        style: cycleCustomStyle(modifier.style, direction),
      };
    case "WIRES":
      return modifier;
  }
}

export function tileSpecKey(spec: TileSpecJson): string {
  return JSON.stringify(canonicalizeTileSpec(spec));
}

export function rotateBrushSpec(
  brush: TileSpecJson,
  direction: BrushCycleDirection,
): TileSpecJson | null {
  const tile = toTileSpecObj(brush);
  let changed = false;

  const nextTile: {
    tile: string;
    dir: Dir | undefined;
    thinWallCanopy:
      | {
          walls: Dir[];
          canopy: boolean;
        }
      | undefined;
    directionalArrows:
      | {
          arrows: Dir[];
        }
      | undefined;
    modifiers: ModifierJson[] | undefined;
    lower: TileSpecJson | undefined;
  } = {
    tile: tile.tile,
    dir: tile.dir,
    thinWallCanopy: tile.thinWallCanopy
      ? {
          walls: sortDirsUnique(
            tile.thinWallCanopy.walls.map((entry) => rotateDir(entry, direction)),
          ),
          canopy: tile.thinWallCanopy.canopy,
        }
      : undefined,
    directionalArrows: tile.directionalArrows
      ? {
          arrows: sortDirsUnique(
            tile.directionalArrows.arrows.map((entry) => rotateDir(entry, direction)),
          ),
        }
      : undefined,
    modifiers: tile.modifiers
      ? tile.modifiers.map((modifier) => mapModifier(modifier, direction))
      : undefined,
    lower: tile.lower !== undefined ? canonicalizeTileSpec(tile.lower) : undefined,
  };

  if (tile.dir !== undefined) {
    nextTile.dir = rotateDir(tile.dir, direction);
    changed = true;
  }

  if (tile.thinWallCanopy) changed = true;
  if (tile.directionalArrows) changed = true;
  if (tile.modifiers && tile.modifiers.length > 0) changed = true;

  if (!changed) return null;

  const nextBrush = canonicalizeTileSpec({
    tile: nextTile.tile,
    ...(nextTile.dir !== undefined ? { dir: nextTile.dir } : {}),
    ...(nextTile.thinWallCanopy !== undefined ? { thinWallCanopy: nextTile.thinWallCanopy } : {}),
    ...(nextTile.directionalArrows !== undefined
      ? { directionalArrows: nextTile.directionalArrows }
      : {}),
    ...(nextTile.modifiers !== undefined ? { modifiers: nextTile.modifiers } : {}),
    ...(nextTile.lower !== undefined ? { lower: nextTile.lower } : {}),
  });
  return tileSpecKey(nextBrush) === tileSpecKey(brush) ? null : nextBrush;
}
