// src/c2m/levelTransform.ts
// src/c2m/levelTransform.ts
import type {
  Dir,
  MapJson,
  ModifierJson,
  TileSpecJson,
  TileSpecObjJson,
  TrackActive,
  TrackPiece,
} from "./mapCodec.js";
import type { C2mJsonV1 } from "./c2mJsonV1.js";

export type LevelTransformKind =
  | "ROTATE_90"
  | "ROTATE_180"
  | "ROTATE_270"
  | "FLIP_H"
  | "FLIP_V"
  | "FLIP_DIAG_NWSE"
  | "FLIP_DIAG_NESW";

type Corner = "NE" | "SE" | "SW" | "NW";

const DIR_ORDER: ReadonlyArray<Dir> = ["N", "E", "S", "W"];
const TRACK_PIECE_ORDER: ReadonlyArray<TrackPiece> = [
  "TURN_NE",
  "TURN_SE",
  "TURN_SW",
  "TURN_NW",
  "HORIZONTAL",
  "VERTICAL",
  "SWITCH",
];

function isObjTile(t: TileSpecJson): t is TileSpecObjJson {
  return typeof t !== "string";
}

function toObjTile(t: TileSpecJson): TileSpecObjJson {
  return typeof t === "string" ? { tile: t } : t;
}

function minimizeTile(obj: TileSpecObjJson): TileSpecJson {
  const hasDir = obj.dir !== undefined;
  const hasT = obj.thinWallCanopy !== undefined;
  const hasA = obj.directionalArrows !== undefined;
  const hasM = obj.modifiers !== undefined && obj.modifiers.length > 0;
  const hasL = obj.lower !== undefined;
  if (!hasDir && !hasT && !hasA && !hasM && !hasL) return obj.tile;
  return obj;
}

function sortDirsUnique(dirs: ReadonlyArray<Dir>): Dir[] {
  const set = new Set<Dir>(dirs);
  return DIR_ORDER.filter((d) => set.has(d));
}

function sortTrackPiecesUnique(pieces: ReadonlyArray<TrackPiece>): TrackPiece[] {
  const set = new Set<TrackPiece>(pieces);
  return TRACK_PIECE_ORDER.filter((p) => set.has(p));
}

function modifierOrder(k: ModifierJson["kind"]): number {
  // Must match mapCodec's canonical ordering
  switch (k) {
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

function swapsHV(kind: LevelTransformKind): boolean {
  return (
    kind === "ROTATE_90" ||
    kind === "ROTATE_270" ||
    kind === "FLIP_DIAG_NWSE" ||
    kind === "FLIP_DIAG_NESW"
  );
}

function mapDir(d: Dir, kind: LevelTransformKind): Dir {
  switch (kind) {
    case "ROTATE_90":
      // N->E->S->W->N
      if (d === "N") return "E";
      if (d === "E") return "S";
      if (d === "S") return "W";
      return "N";

    case "ROTATE_180":
      if (d === "N") return "S";
      if (d === "S") return "N";
      if (d === "E") return "W";
      return "E";

    case "ROTATE_270":
      if (d === "N") return "W";
      if (d === "W") return "S";
      if (d === "S") return "E";
      return "N";

    case "FLIP_H":
      if (d === "E") return "W";
      if (d === "W") return "E";
      return d;

    case "FLIP_V":
      if (d === "N") return "S";
      if (d === "S") return "N";
      return d;

    case "FLIP_DIAG_NWSE":
      // reflect across y=x: N<->W, E<->S
      if (d === "N") return "W";
      if (d === "W") return "N";
      if (d === "E") return "S";
      return "E";

    case "FLIP_DIAG_NESW":
      // reflect across anti-diagonal: N<->E, S<->W
      if (d === "N") return "E";
      if (d === "E") return "N";
      if (d === "S") return "W";
      return "S";
  }
}

function mapCorner(c: Corner, kind: LevelTransformKind): Corner {
  switch (kind) {
    case "ROTATE_90":
      // NE->SE->SW->NW->NE
      if (c === "NE") return "SE";
      if (c === "SE") return "SW";
      if (c === "SW") return "NW";
      return "NE";

    case "ROTATE_180":
      // NE<->SW, SE<->NW
      if (c === "NE") return "SW";
      if (c === "SW") return "NE";
      if (c === "SE") return "NW";
      return "SE";

    case "ROTATE_270":
      // NE->NW->SW->SE->NE
      if (c === "NE") return "NW";
      if (c === "NW") return "SW";
      if (c === "SW") return "SE";
      return "NE";

    case "FLIP_H":
      // NE<->NW, SE<->SW
      if (c === "NE") return "NW";
      if (c === "NW") return "NE";
      if (c === "SE") return "SW";
      return "SE";

    case "FLIP_V":
      // NE<->SE, NW<->SW
      if (c === "NE") return "SE";
      if (c === "SE") return "NE";
      if (c === "NW") return "SW";
      return "NW";

    case "FLIP_DIAG_NWSE":
      // NE<->SW, NW fixed, SE fixed
      if (c === "NE") return "SW";
      if (c === "SW") return "NE";
      return c;

    case "FLIP_DIAG_NESW":
      // NW<->SE, NE fixed, SW fixed
      if (c === "NW") return "SE";
      if (c === "SE") return "NW";
      return c;
  }
}

function mapHV(v: "H" | "V", kind: LevelTransformKind): "H" | "V" {
  if (!swapsHV(kind)) return v;
  return v === "H" ? "V" : "H";
}

function transformTileName(name: string, kind: LevelTransformKind): string {
  // Cardinal suffix: *_N|*_E|*_S|*_W
  {
    const m = /^(.*)_(N|E|S|W)$/.exec(name);
    if (m) {
      const prefix = m[1]!;
      const dir = m[2]! as Dir;
      const nd = mapDir(dir, kind);
      return `${prefix}_${nd}`;
    }
  }

  // Corner suffix: *_NE|*_SE|*_SW|*_NW
  {
    const m = /^(.*)_(NE|SE|SW|NW)$/.exec(name);
    if (m) {
      const prefix = m[1]!;
      const c = m[2]! as Corner;
      const nc = mapCorner(c, kind);
      return `${prefix}_${nc}`;
    }
  }

  return name;
}

function transformArrowSymbol(sym: string, kind: LevelTransformKind): string {
  let d: Dir | null = null;
  if (sym === "↑") d = "N";
  else if (sym === "→") d = "E";
  else if (sym === "↓") d = "S";
  else if (sym === "←") d = "W";
  else return sym;

  const nd = mapDir(d, kind);
  if (nd === "N") return "↑";
  if (nd === "E") return "→";
  if (nd === "S") return "↓";
  return "←";
}

function transformTrackPiece(p: TrackPiece, kind: LevelTransformKind): TrackPiece {
  if (p === "SWITCH") return p;
  if (p === "HORIZONTAL") return swapsHV(kind) ? "VERTICAL" : "HORIZONTAL";
  if (p === "VERTICAL") return swapsHV(kind) ? "HORIZONTAL" : "VERTICAL";

  // TURN_XX
  const m = /^TURN_(NE|SE|SW|NW)$/.exec(p);
  if (!m) return p;

  const c = m[1]! as Corner;
  const nc = mapCorner(c, kind);
  return `TURN_${nc}` as TrackPiece;
}

function transformTrackActive(a: TrackActive, kind: LevelTransformKind): TrackActive {
  if (a === "H" || a === "V") return mapHV(a, kind);

  const c = a as Corner;
  return mapCorner(c, kind) as TrackActive;
}

function transformModifier(m: ModifierJson, kind: LevelTransformKind): ModifierJson {
  switch (m.kind) {
    case "CUSTOM_STYLE":
      return m;

    case "WIRES": {
      const wires = sortDirsUnique(m.wires.map((d) => mapDir(d, kind)));
      const tunnels = sortDirsUnique(m.tunnels.map((d) => mapDir(d, kind)));
      return { kind: "WIRES", wires, tunnels };
    }

    case "CLONE_ARROWS": {
      const arrows = sortDirsUnique(m.arrows.map((d) => mapDir(d, kind)));
      return { kind: "CLONE_ARROWS", arrows };
    }

    case "LETTER_SYMBOL": {
      const symbol = transformArrowSymbol(m.symbol, kind);
      return { kind: "LETTER_SYMBOL", symbol };
    }

    case "LOGIC": {
      if (m.gate === "COUNTER") {
        const result: { kind: "LOGIC"; gate: "COUNTER"; counterValue?: number } = {
          kind: "LOGIC",
          gate: "COUNTER",
        };
        if (m.counterValue !== undefined) {
          result.counterValue = m.counterValue;
        }
        return result;
      }
      if (!m.facing) {
        // Parser guarantees facing for non-counter; if absent, preserve absence.
        return m;
      }
      return { kind: "LOGIC", gate: m.gate, facing: mapDir(m.facing, kind) };
    }

    case "TRACKS": {
      const pieces = sortTrackPiecesUnique(m.pieces.map((p) => transformTrackPiece(p, kind)));
      const active = transformTrackActive(m.active, kind);
      const entered = mapDir(m.entered, kind);
      return { kind: "TRACKS", pieces, active, entered };
    }
  }
}

function transformTileSpec(spec: TileSpecJson, kind: LevelTransformKind): TileSpecJson {
  const obj0 = toObjTile(spec);

  const tile = transformTileName(obj0.tile, kind);
  const out: {
    tile: string;
    dir?: Dir;
    thinWallCanopy?: NonNullable<TileSpecObjJson["thinWallCanopy"]>;
    directionalArrows?: NonNullable<TileSpecObjJson["directionalArrows"]>;
    modifiers?: ModifierJson[];
    lower?: TileSpecJson;
  } = { tile };

  if (obj0.dir !== undefined) out.dir = mapDir(obj0.dir, kind);

  if (obj0.thinWallCanopy !== undefined) {
    const walls = sortDirsUnique(obj0.thinWallCanopy.walls.map((d) => mapDir(d, kind)));
    const canopy = obj0.thinWallCanopy.canopy;
    out.thinWallCanopy = { walls, canopy };
  }

  if (obj0.directionalArrows !== undefined) {
    const arrows = sortDirsUnique(obj0.directionalArrows.arrows.map((d) => mapDir(d, kind)));
    out.directionalArrows = { arrows };
  }

  if (obj0.modifiers && obj0.modifiers.length > 0) {
    const mods = obj0.modifiers.map((m) => transformModifier(m, kind));
    mods.sort((a, b) => modifierOrder(a.kind) - modifierOrder(b.kind));
    out.modifiers = mods;
  }

  if (obj0.lower !== undefined) {
    out.lower = transformTileSpec(obj0.lower, kind);
  }

  return minimizeTile(out);
}

function mapPos(
  x: number,
  y: number,
  w: number,
  h: number,
  kind: LevelTransformKind,
): { x: number; y: number; w2: number; h2: number } {
  switch (kind) {
    case "ROTATE_90":
      return { x: h - 1 - y, y: x, w2: h, h2: w };
    case "ROTATE_180":
      return { x: w - 1 - x, y: h - 1 - y, w2: w, h2: h };
    case "ROTATE_270":
      return { x: y, y: w - 1 - x, w2: h, h2: w };
    case "FLIP_H":
      return { x: w - 1 - x, y, w2: w, h2: h };
    case "FLIP_V":
      return { x, y: h - 1 - y, w2: w, h2: h };
    case "FLIP_DIAG_NWSE":
      return { x: y, y: x, w2: h, h2: w };
    case "FLIP_DIAG_NESW":
      return { x: h - 1 - y, y: w - 1 - x, w2: h, h2: w };
  }
}

export function transformMap(map: MapJson, kind: LevelTransformKind): MapJson {
  const w = map.width;
  const h = map.height;

  const { w2, h2 } = mapPos(0, 0, w, h, kind);
  const outTiles: TileSpecJson[] = new Array<TileSpecJson>(w2 * h2);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const t = map.tiles[idx];
      if (t === undefined) throw new Error(`Missing tile at index ${idx}`);

      const p = mapPos(x, y, w, h, kind);
      const idx2 = p.y * w2 + p.x;

      outTiles[idx2] = transformTileSpec(t, kind);
    }
  }

  // sanity: ensure all filled
  for (let i = 0; i < outTiles.length; i++) {
    if (outTiles[i] === undefined) throw new Error(`Transform produced hole at index ${i}`);
  }

  return { width: w2, height: h2, tiles: outTiles };
}

export function transformLevelJson(doc: C2mJsonV1, kind: LevelTransformKind): C2mJsonV1 {
  if (!doc.map) return doc;
  return { ...doc, map: transformMap(doc.map, kind) };
}
