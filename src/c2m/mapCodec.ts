// src/c2m/mapCodec.ts
//
// Option B tile representation:
// - TileSpecJson is either a string (tile name) OR an object with "tile" plus extras.
// - No "raw" or "mask" fields appear in JSON.
// - Encoder recomputes numeric modifier values from semantic fields.

import { BinaryReader, BinaryWriter } from "./binary.js";

export type Dir = "N" | "E" | "S" | "W";

export type TrackPiece =
  | "TURN_NE"
  | "TURN_SE"
  | "TURN_SW"
  | "TURN_NW"
  | "HORIZONTAL"
  | "VERTICAL"
  | "SWITCH";

export type TrackActive = "NE" | "SE" | "SW" | "NW" | "H" | "V";

export type LogicGate =
  | "INVERTER"
  | "AND"
  | "OR"
  | "XOR"
  | "LATCH_CW"
  | "LATCH_CCW"
  | "NAND"
  | "COUNTER";

export type ModifierJson =
  | Readonly<{
      kind: "WIRES";
      wires: ReadonlyArray<Dir>;
      tunnels: ReadonlyArray<Dir>;
    }>
  | Readonly<{
      kind: "TRACKS";
      pieces: ReadonlyArray<TrackPiece>;
      active: TrackActive;
      entered: Dir;
    }>
  | Readonly<{
      kind: "CLONE_ARROWS";
      arrows: ReadonlyArray<Dir>;
    }>
  | Readonly<{
      kind: "CUSTOM_STYLE";
      style: "GREEN" | "PINK" | "YELLOW" | "BLUE";
    }>
  | Readonly<{
      kind: "LETTER_SYMBOL";
      symbol: string; // ↑→↓← or ASCII ' '..'_' (0x20..0x5F)
    }>
  | Readonly<{
      kind: "LOGIC";
      gate: LogicGate;
      facing?: Dir; // required for all except COUNTER
      counterValue?: number; // required for COUNTER (0..9)
    }>;

export type TileSpecObjJson = Readonly<{
  tile: string; // e.g. "CUSTOM_WALL" or "UNKNOWN_0xAB"
  dir?: Dir;

  thinWallCanopy?: Readonly<{
    walls: ReadonlyArray<Dir>;
    canopy: boolean;
  }>;

  directionalArrows?: Readonly<{
    arrows: ReadonlyArray<Dir>;
  }>;

  modifiers?: ReadonlyArray<ModifierJson>;
  lower?: TileSpecJson;
}>;

export type TileSpecJson = string | TileSpecObjJson;

export type MapJson = Readonly<{
  width: number; // u8
  height: number; // u8
  tiles: ReadonlyArray<TileSpecJson>; // row-major, length = width*height
}>;

const MOD_8 = 0x76;
const MOD_16 = 0x77;
const MOD_32 = 0x78;

const TILE_RAILROAD_TRACK = 0x4f;
const TILE_LOGIC_GATE = 0x5c;
const TILE_CUSTOM_FLOOR = 0x6b;
const TILE_THINWALL_CANOPY = 0x6d;
const TILE_CUSTOM_WALL = 0x70;
const TILE_LETTER = 0x71;
const TILE_DIRECTIONAL_BLOCK = 0x81;
const TILE_CLONE_MACHINE_OLD = 0x43;
const TILE_CLONE_MACHINE = 0x44;

// Wires modifier applies to these tiles (from your spec excerpt)
const WIRES_TILES = new Set<number>([
  0x01, // Floor
  0x10, // Red teleport
  0x11, // Blue teleport
  0x4e, // Transmogrifier
  0x50, // Steel wall
  0x88, // Switch off
  0x89, // Switch on
  0x5e, // Pink button
  0x87, // Black button
]);

// Tiles whose spec is: dir (u8) + lower (TileSpec)
const DIR_AND_LOWER = new Set<number>([
  0x16,
  0x17,
  0x18,
  0x19,
  0x1a, // chip, dirt block, walker, ship, ice block
  0x21, // blue tank
  0x33,
  0x34,
  0x35,
  0x36,
  0x37,
  0x38, // ant..fire box
  0x53, // unused
  0x56,
  0x57,
  0x58, // melinda, timid teeth, explosion anim
  0x5d, // unused
  0x63, // yellow tank
  0x65,
  0x66, // mirror chip/melinda
  0x69, // rover
  0x79, // unused
  0x82, // floor mimic
  0x8b, // ghost
]);

// Tiles whose spec is: lower (TileSpec)
const LOWER_ONLY = new Set<number>([
  0x1b,
  0x1c,
  0x1d, // thin walls
  0x26,
  0x27,
  0x28,
  0x29, // keys
  0x2a,
  0x2b, // chips
  0x3b,
  0x3c,
  0x3d,
  0x3e, // boots
  0x40, // cherry bomb
  0x4c,
  0x4d, // time bonus, stopwatch
  0x51,
  0x52, // time bomb, helmet
  0x59, // hiking boots
  0x62, // lightning bolt
  0x68, // bowling ball
  0x6a, // time penalty
  0x6f, // railroad sign
  0x7a,
  0x7b,
  0x7c, // flags
  0x7f, // not allowed marker
  0x80, // 2x flag
  0x83,
  0x84,
  0x85,
  0x86, // green bomb/chip + unused
  0x8c, // steel foil
  0x8e,
  0x8f, // secret eye, bribe
  0x90, // speed boots
  0x92, // hook
]);

// Complete tile name table per your wiki (including UNUSED and modifier wrapper codes)
const TILE_NAME_BY_ID = new Map<number, string>([
  [0x01, "FLOOR"],
  [0x02, "WALL"],
  [0x03, "ICE"],
  [0x04, "ICE_CORNER_SW"],
  [0x05, "ICE_CORNER_NW"],
  [0x06, "ICE_CORNER_NE"],
  [0x07, "ICE_CORNER_SE"],
  [0x08, "WATER"],
  [0x09, "FIRE"],
  [0x0a, "FORCE_N"],
  [0x0b, "FORCE_E"],
  [0x0c, "FORCE_S"],
  [0x0d, "FORCE_W"],
  [0x0e, "GREEN_TOGGLE_WALL"],
  [0x0f, "GREEN_TOGGLE_FLOOR"],
  [0x10, "RED_TELEPORT"],
  [0x11, "BLUE_TELEPORT"],
  [0x12, "YELLOW_TELEPORT"],
  [0x13, "GREEN_TELEPORT"],
  [0x14, "EXIT"],
  [0x15, "SLIME"],
  [0x16, "CHIP"],
  [0x17, "DIRT_BLOCK"],
  [0x18, "WALKER"],
  [0x19, "SHIP"],
  [0x1a, "ICE_BLOCK"],
  [0x1b, "THIN_WALL_S"],
  [0x1c, "THIN_WALL_E"],
  [0x1d, "THIN_WALL_SE"],
  [0x1e, "GRAVEL"],
  [0x1f, "GREEN_BUTTON"],
  [0x20, "BLUE_BUTTON"],
  [0x21, "BLUE_TANK"],
  [0x22, "RED_DOOR"],
  [0x23, "BLUE_DOOR"],
  [0x24, "YELLOW_DOOR"],
  [0x25, "GREEN_DOOR"],
  [0x26, "RED_KEY"],
  [0x27, "BLUE_KEY"],
  [0x28, "YELLOW_KEY"],
  [0x29, "GREEN_KEY"],
  [0x2a, "IC_CHIP"],
  [0x2b, "EXTRA_IC_CHIP"],
  [0x2c, "CHIP_SOCKET"],
  [0x2d, "POP_UP_WALL"],
  [0x2e, "APPEARING_WALL"],
  [0x2f, "INVISIBLE_WALL"],
  [0x30, "SOLID_BLUE_WALL"],
  [0x31, "FALSE_BLUE_WALL"],
  [0x32, "DIRT"],
  [0x33, "ANT"],
  [0x34, "CENTIPEDE"],
  [0x35, "PURPLE_BALL"],
  [0x36, "BLOB"],
  [0x37, "ANGRY_TEETH"],
  [0x38, "FIRE_BOX"],
  [0x39, "RED_BUTTON"],
  [0x3a, "BROWN_BUTTON"],
  [0x3b, "CLEATS"],
  [0x3c, "SUCTION_BOOTS"],
  [0x3d, "FIRE_BOOTS"],
  [0x3e, "FLIPPERS"],
  [0x3f, "TOOL_THIEF"],
  [0x40, "CHERRY_BOMB"],
  [0x41, "OPEN_TRAP_UNUSED"],
  [0x42, "TRAP"],
  [0x43, "CLONE_MACHINE_OLD"],
  [0x44, "CLONE_MACHINE"],
  [0x45, "CLUE"],
  [0x46, "FORCE_RANDOM"],
  [0x47, "GRAY_BUTTON"],
  [0x48, "SWIVEL_DOOR_SW"],
  [0x49, "SWIVEL_DOOR_NW"],
  [0x4a, "SWIVEL_DOOR_NE"],
  [0x4b, "SWIVEL_DOOR_SE"],
  [0x4c, "TIME_BONUS"],
  [0x4d, "STOPWATCH"],
  [0x4e, "TRANSMOGRIFIER"],
  [0x4f, "RAILROAD_TRACK"],
  [0x50, "STEEL_WALL"],
  [0x51, "TIME_BOMB"],
  [0x52, "HELMET"],
  [0x53, "UNUSED_53"],
  [0x54, "UNUSED_54"],
  [0x55, "UNUSED_55"],
  [0x56, "MELINDA"],
  [0x57, "TIMID_TEETH"],
  [0x58, "EXPLOSION_ANIMATION_UNUSED"],
  [0x59, "HIKING_BOOTS"],
  [0x5a, "MALE_ONLY_SIGN"],
  [0x5b, "FEMALE_ONLY_SIGN"],
  [0x5c, "LOGIC_GATE"],
  [0x5d, "UNUSED_5D"],
  [0x5e, "PINK_BUTTON"],
  [0x5f, "FLAME_JET_OFF"],
  [0x60, "FLAME_JET_ON"],
  [0x61, "ORANGE_BUTTON"],
  [0x62, "LIGHTNING_BOLT"],
  [0x63, "YELLOW_TANK"],
  [0x64, "YELLOW_TANK_BUTTON"],
  [0x65, "MIRROR_CHIP"],
  [0x66, "MIRROR_MELINDA"],
  [0x67, "UNUSED_67"],
  [0x68, "BOWLING_BALL"],
  [0x69, "ROVER"],
  [0x6a, "TIME_PENALTY"],
  [0x6b, "CUSTOM_FLOOR"],
  [0x6c, "UNUSED_6C"],
  [0x6d, "THINWALL_CANOPY"],
  [0x6e, "UNUSED_6E"],
  [0x6f, "RAILROAD_SIGN"],
  [0x70, "CUSTOM_WALL"],
  [0x71, "LETTER_TILE"],
  [0x72, "PURPLE_TOGGLE_FLOOR"],
  [0x73, "PURPLE_TOGGLE_WALL"],
  [0x74, "UNUSED_74"],
  [0x75, "UNUSED_75"],
  [0x76, "MODIFIER_8BIT"],
  [0x77, "MODIFIER_16BIT"],
  [0x78, "MODIFIER_32BIT"],
  [0x79, "UNUSED_79"],
  [0x7a, "FLAG_10"],
  [0x7b, "FLAG_100"],
  [0x7c, "FLAG_1000"],
  [0x7d, "SOLID_GREEN_WALL"],
  [0x7e, "FALSE_GREEN_WALL"],
  [0x7f, "NOT_ALLOWED_MARKER"],
  [0x80, "FLAG_2X"],
  [0x81, "DIRECTIONAL_BLOCK"],
  [0x82, "FLOOR_MIMIC"],
  [0x83, "GREEN_BOMB"],
  [0x84, "GREEN_CHIP"],
  [0x85, "UNUSED_85"],
  [0x86, "UNUSED_86"],
  [0x87, "BLACK_BUTTON"],
  [0x88, "SWITCH_OFF"],
  [0x89, "SWITCH_ON"],
  [0x8a, "KEY_THIEF"],
  [0x8b, "GHOST"],
  [0x8c, "STEEL_FOIL"],
  [0x8d, "TURTLE"],
  [0x8e, "SECRET_EYE"],
  [0x8f, "THIEF_BRIBE"],
  [0x90, "SPEED_BOOTS"],
  [0x91, "UNUSED_91"],
  [0x92, "HOOK"],
]);

const TILE_ID_BY_NAME = new Map<string, number>();
for (const [id, name] of TILE_NAME_BY_ID.entries()) TILE_ID_BY_NAME.set(name, id);

function assertU8(v: number, label: string): void {
  if (!Number.isInteger(v) || v < 0 || v > 0xff) throw new Error(`${label} must be u8, got ${v}`);
}
function assertU16(v: number, label: string): void {
  if (!Number.isInteger(v) || v < 0 || v > 0xffff)
    throw new Error(`${label} must be u16, got ${v}`);
}
function assertU32(v: number, label: string): void {
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff)
    throw new Error(`${label} must be u32, got ${v}`);
}

function tileNameFromId(id: number): string {
  const name = TILE_NAME_BY_ID.get(id);
  if (name) return name;
  return `UNKNOWN_0x${id.toString(16).padStart(2, "0").toUpperCase()}`;
}

function tileIdFromName(name: string): number {
  const known = TILE_ID_BY_NAME.get(name);
  if (known !== undefined) return known;

  const m = /^UNKNOWN_0x([0-9A-Fa-f]{2})$/.exec(name);
  if (m) return parseInt(m[1]!, 16);

  throw new Error(`Unknown tile name '${name}' (expected known name or UNKNOWN_0xNN)`);
}

function dirFromByte(b: number): Dir {
  switch (b) {
    case 0:
      return "N";
    case 1:
      return "E";
    case 2:
      return "S";
    case 3:
      return "W";
    default:
      throw new Error(`Direction byte must be 0..3, got ${b}`);
  }
}
function dirToByte(d: Dir): 0 | 1 | 2 | 3 {
  switch (d) {
    case "N":
      return 0;
    case "E":
      return 1;
    case "S":
      return 2;
    case "W":
      return 3;
  }
}

const DIR_ORDER: ReadonlyArray<Dir> = ["N", "E", "S", "W"];
function sortDirsUnique(dirs: ReadonlyArray<Dir>): Dir[] {
  const set = new Set<Dir>(dirs);
  return DIR_ORDER.filter((d) => set.has(d));
}

function maskFromDirs(dirs: ReadonlyArray<Dir>): number {
  let m = 0;
  for (const d of dirs) {
    if (d === "N") m |= 0x1;
    else if (d === "E") m |= 0x2;
    else if (d === "S") m |= 0x4;
    else m |= 0x8;
  }
  return m;
}

function dirsFromMask(mask: number, bits: ReadonlyArray<readonly [number, Dir]>): Dir[] {
  const out: Dir[] = [];
  for (const [bit, d] of bits) if ((mask & bit) !== 0) out.push(d);
  return out;
}

function decodeWiresValue(value: number): Extract<ModifierJson, { kind: "WIRES" }> {
  assertU8(value, "WIRES");
  const wires = dirsFromMask(value, [
    [0x1, "N"],
    [0x2, "E"],
    [0x4, "S"],
    [0x8, "W"],
  ]);
  const tunnels = dirsFromMask(value, [
    [0x10, "N"],
    [0x20, "E"],
    [0x40, "S"],
    [0x80, "W"],
  ]);
  return { kind: "WIRES", wires, tunnels };
}

function decodeCloneArrowsValue(value: number): Extract<ModifierJson, { kind: "CLONE_ARROWS" }> {
  assertU8(value, "CLONE_ARROWS");
  const arrows = dirsFromMask(value, [
    [0x1, "N"],
    [0x2, "E"],
    [0x4, "S"],
    [0x8, "W"],
  ]);
  return { kind: "CLONE_ARROWS", arrows };
}

function decodeCustomStyleValue(value: number): Extract<ModifierJson, { kind: "CUSTOM_STYLE" }> {
  assertU8(value, "CUSTOM_STYLE");
  switch (value) {
    case 0:
      return { kind: "CUSTOM_STYLE", style: "GREEN" };
    case 1:
      return { kind: "CUSTOM_STYLE", style: "PINK" };
    case 2:
      return { kind: "CUSTOM_STYLE", style: "YELLOW" };
    case 3:
      return { kind: "CUSTOM_STYLE", style: "BLUE" };
    default:
      throw new Error(`CUSTOM_STYLE value must be 0..3, got ${value}`);
  }
}

function decodeLetterSymbolValue(value: number): Extract<ModifierJson, { kind: "LETTER_SYMBOL" }> {
  assertU8(value, "LETTER_SYMBOL");
  switch (value) {
    case 0x1c:
      return { kind: "LETTER_SYMBOL", symbol: "↑" };
    case 0x1d:
      return { kind: "LETTER_SYMBOL", symbol: "→" };
    case 0x1e:
      return { kind: "LETTER_SYMBOL", symbol: "↓" };
    case 0x1f:
      return { kind: "LETTER_SYMBOL", symbol: "←" };
    default:
      if (value >= 0x20 && value <= 0x5f)
        return { kind: "LETTER_SYMBOL", symbol: String.fromCharCode(value) };
      throw new Error(`LETTER_SYMBOL value out of allowed range: 0x${value.toString(16)}`);
  }
}

function decodeLogicValue(value: number): Extract<ModifierJson, { kind: "LOGIC" }> {
  assertU8(value, "LOGIC");
  const mk = (
    gate: LogicGate,
    facing?: Dir,
    counterValue?: number,
  ): Extract<ModifierJson, { kind: "LOGIC" }> => {
    const out: { kind: "LOGIC"; gate: LogicGate; facing?: Dir; counterValue?: number } = {
      kind: "LOGIC",
      gate,
    };
    if (facing !== undefined) out.facing = facing;
    if (counterValue !== undefined) out.counterValue = counterValue;
    return out;
  };

  const face = (v: number): Dir => dirFromByte(v);

  if (value >= 0x00 && value <= 0x03) return mk("INVERTER", face(value - 0x00));
  if (value >= 0x04 && value <= 0x07) return mk("AND", face(value - 0x04));
  if (value >= 0x08 && value <= 0x0b) return mk("OR", face(value - 0x08));
  if (value >= 0x0c && value <= 0x0f) return mk("XOR", face(value - 0x0c));
  if (value >= 0x10 && value <= 0x13) return mk("LATCH_CW", face(value - 0x10));
  if (value >= 0x14 && value <= 0x17) return mk("NAND", face(value - 0x14));
  if (value >= 0x40 && value <= 0x43) return mk("LATCH_CCW", face(value - 0x40));
  if (value >= 0x1e && value <= 0x27) return mk("COUNTER", undefined, value - 0x1e);

  throw new Error(`Unsupported LOGIC modifier value 0x${value.toString(16)} (voodoo)`);
}

function decodeTracksValue(value: number): Extract<ModifierJson, { kind: "TRACKS" }> {
  assertU16(value, "TRACKS");
  const low = value & 0xff;
  const high = (value >> 8) & 0xff;

  const pieces: TrackPiece[] = [];
  if (low & 0x01) pieces.push("TURN_NE");
  if (low & 0x02) pieces.push("TURN_SE");
  if (low & 0x04) pieces.push("TURN_SW");
  if (low & 0x08) pieces.push("TURN_NW");
  if (low & 0x10) pieces.push("HORIZONTAL");
  if (low & 0x20) pieces.push("VERTICAL");
  if (low & 0x40) pieces.push("SWITCH");

  const activeNibble = high & 0x0f;
  const enteredNibble = (high >> 4) & 0x0f;

  let active: TrackActive;
  switch (activeNibble) {
    case 0x0:
      active = "NE";
      break;
    case 0x1:
      active = "SE";
      break;
    case 0x2:
      active = "SW";
      break;
    case 0x3:
      active = "NW";
      break;
    case 0x4:
      active = "H";
      break;
    case 0x5:
      active = "V";
      break;
    default:
      throw new Error(`Invalid TRACKS active nibble: ${activeNibble}`);
  }
  if (enteredNibble > 3) throw new Error(`Invalid TRACKS entered nibble: ${enteredNibble}`);
  const entered = dirFromByte(enteredNibble);

  return { kind: "TRACKS", pieces, active, entered };
}

function decodeThinWallCanopy(mask: number): NonNullable<TileSpecObjJson["thinWallCanopy"]> {
  assertU8(mask, "thinWallCanopy");
  const walls = dirsFromMask(mask, [
    [0x1, "N"],
    [0x2, "E"],
    [0x4, "S"],
    [0x8, "W"],
  ]);
  const canopy = (mask & 0x10) !== 0;
  return { walls, canopy };
}

function decodeDirectionalArrows(mask: number): NonNullable<TileSpecObjJson["directionalArrows"]> {
  assertU8(mask, "directionalArrows");
  const arrows = dirsFromMask(mask, [
    [0x1, "N"],
    [0x2, "E"],
    [0x4, "S"],
    [0x8, "W"],
  ]);
  return { arrows };
}

function modifierKindOrder(k: ModifierJson["kind"]): number {
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

function readModifierValue(r: BinaryReader, modTag: number): number {
  if (modTag === MOD_8) return r.readU8();
  if (modTag === MOD_16) return r.readU16LE();
  return r.readU32LE();
}

function interpretModifier(tileId: number, value: number): ModifierJson {
  if (WIRES_TILES.has(tileId)) return decodeWiresValue(value & 0xff);
  if (tileId === TILE_RAILROAD_TRACK) return decodeTracksValue(value & 0xffff);
  if (tileId === TILE_CLONE_MACHINE || tileId === TILE_CLONE_MACHINE_OLD)
    return decodeCloneArrowsValue(value & 0xff);
  if (tileId === TILE_CUSTOM_FLOOR || tileId === TILE_CUSTOM_WALL)
    return decodeCustomStyleValue(value & 0xff);
  if (tileId === TILE_LETTER) return decodeLetterSymbolValue(value & 0xff);
  if (tileId === TILE_LOGIC_GATE) return decodeLogicValue(value & 0xff);
  throw new Error(
    `Modifier present for unsupported tile 0x${tileId.toString(16)} (value=${value})`,
  );
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

function parseTileSpecBytes(r: BinaryReader): TileSpecJson {
  const modifierValues: number[] = [];

  while (true) {
    const b = r.readU8();

    if (b !== MOD_8 && b !== MOD_16 && b !== MOD_32) {
      const tileId = b;
      const tileName = tileNameFromId(tileId);

      const base: {
        tile: string;
        dir?: Dir;
        thinWallCanopy?: NonNullable<TileSpecObjJson["thinWallCanopy"]>;
        directionalArrows?: NonNullable<TileSpecObjJson["directionalArrows"]>;
        modifiers?: ModifierJson[];
        lower?: TileSpecJson;
      } = { tile: tileName };

      if (tileId === TILE_DIRECTIONAL_BLOCK) {
        base.dir = dirFromByte(r.readU8());
        base.directionalArrows = decodeDirectionalArrows(r.readU8());
        base.lower = parseTileSpecBytes(r);
      } else if (tileId === TILE_THINWALL_CANOPY) {
        base.thinWallCanopy = decodeThinWallCanopy(r.readU8());
        base.lower = parseTileSpecBytes(r);
      } else if (DIR_AND_LOWER.has(tileId)) {
        base.dir = dirFromByte(r.readU8());
        base.lower = parseTileSpecBytes(r);
      } else if (LOWER_ONLY.has(tileId)) {
        base.lower = parseTileSpecBytes(r);
      }

      if (modifierValues.length > 0) {
        const mods = modifierValues.map((v) => interpretModifier(tileId, v));
        mods.sort((a, b2) => modifierKindOrder(a.kind) - modifierKindOrder(b2.kind));
        base.modifiers = mods;
      }

      return minimizeTile(base);
    }

    modifierValues.push(readModifierValue(r, b));
  }
}

export function decodeMapBytesToJson(unpackedMapBytes: Uint8Array): MapJson {
  const r = new BinaryReader(Buffer.from(unpackedMapBytes));
  const width = r.readU8();
  const height = r.readU8();

  const n = width * height;
  const tiles: TileSpecJson[] = [];
  for (let i = 0; i < n; i++) {
    try {
      tiles.push(parseTileSpecBytes(r));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`MAP parse failed at tileIndex=${i} of ${n}: ${msg}`);
    }
  }

  if (r.remaining() !== 0) {
    throw new Error(`MAP has trailing bytes after ${n} tiles: ${r.remaining()}`);
  }

  return { width, height, tiles };
}

function writeModifier(w: BinaryWriter, value: number): void {
  assertU32(value, "modifier value");
  if (value <= 0xff) {
    w.writeU8(MOD_8);
    w.writeU8(value);
  } else if (value <= 0xffff) {
    w.writeU8(MOD_16);
    w.writeU16LE(value);
  } else {
    w.writeU8(MOD_32);
    w.writeU32LE(value >>> 0);
  }
}

function encodeTracksValue(m: Extract<ModifierJson, { kind: "TRACKS" }>): number {
  const pieceSet = new Set<TrackPiece>(m.pieces);
  let low = 0;
  if (pieceSet.has("TURN_NE")) low |= 0x01;
  if (pieceSet.has("TURN_SE")) low |= 0x02;
  if (pieceSet.has("TURN_SW")) low |= 0x04;
  if (pieceSet.has("TURN_NW")) low |= 0x08;
  if (pieceSet.has("HORIZONTAL")) low |= 0x10;
  if (pieceSet.has("VERTICAL")) low |= 0x20;
  if (pieceSet.has("SWITCH")) low |= 0x40;

  let activeNibble: number;
  switch (m.active) {
    case "NE":
      activeNibble = 0;
      break;
    case "SE":
      activeNibble = 1;
      break;
    case "SW":
      activeNibble = 2;
      break;
    case "NW":
      activeNibble = 3;
      break;
    case "H":
      activeNibble = 4;
      break;
    case "V":
      activeNibble = 5;
      break;
  }

  const enteredNibble = dirToByte(m.entered);
  return (low & 0xff) | ((activeNibble & 0x0f) << 8) | ((enteredNibble & 0x0f) << 12);
}

function encodeLogicValue(m: Extract<ModifierJson, { kind: "LOGIC" }>): number {
  const dirIndex = (d: Dir): number => dirToByte(d);

  if (m.gate === "COUNTER") {
    const v = m.counterValue as number;
    if (!Number.isInteger(v) || v < 0 || v > 9)
      throw new Error(`LOGIC COUNTER counterValue must be 0..9`);
    return 0x1e + v;
  }

  if (!m.facing) throw new Error(`LOGIC ${m.gate} requires facing`);

  switch (m.gate) {
    case "INVERTER":
      return 0x00 + dirIndex(m.facing);
    case "AND":
      return 0x04 + dirIndex(m.facing);
    case "OR":
      return 0x08 + dirIndex(m.facing);
    case "XOR":
      return 0x0c + dirIndex(m.facing);
    case "LATCH_CW":
      return 0x10 + dirIndex(m.facing);
    case "NAND":
      return 0x14 + dirIndex(m.facing);
    case "LATCH_CCW":
      return 0x40 + dirIndex(m.facing);
  }
}

function encodeLetterSymbolValue(m: Extract<ModifierJson, { kind: "LETTER_SYMBOL" }>): number {
  const s = m.symbol;
  if (s === "↑") return 0x1c;
  if (s === "→") return 0x1d;
  if (s === "↓") return 0x1e;
  if (s === "←") return 0x1f;

  if (s.length === 1) {
    const code = s.charCodeAt(0);
    if (code >= 0x20 && code <= 0x5f) return code;
  }

  throw new Error(`LETTER_SYMBOL.symbol must be ↑→↓← or ASCII ' '..'_' (0x20..0x5F). Got '${s}'`);
}

function modifierValue(tileId: number, m: ModifierJson): number {
  switch (m.kind) {
    case "WIRES": {
      const wires = sortDirsUnique(m.wires);
      const tunnels = sortDirsUnique(m.tunnels);
      return (maskFromDirs(wires) | (maskFromDirs(tunnels) << 4)) & 0xff;
    }
    case "TRACKS":
      if (tileId !== TILE_RAILROAD_TRACK)
        throw new Error(`TRACKS modifier on non-track tile 0x${tileId.toString(16)}`);
      return encodeTracksValue(m);
    case "CLONE_ARROWS":
      return maskFromDirs(sortDirsUnique(m.arrows)) & 0xff;
    case "CUSTOM_STYLE":
      switch (m.style) {
        case "GREEN":
          return 0;
        case "PINK":
          return 1;
        case "YELLOW":
          return 2;
        case "BLUE":
          return 3;
      }
    case "LETTER_SYMBOL":
      return encodeLetterSymbolValue(m);
    case "LOGIC":
      if (tileId !== TILE_LOGIC_GATE)
        throw new Error(`LOGIC modifier on non-logic tile 0x${tileId.toString(16)}`);
      return encodeLogicValue(m) & 0xff;
  }
}

function encodeThinWallCanopyMask(spec: NonNullable<TileSpecObjJson["thinWallCanopy"]>): number {
  const walls = sortDirsUnique(spec.walls);
  let m = maskFromDirs(walls) & 0x0f;
  if (spec.canopy) m |= 0x10;
  return m & 0xff;
}

function encodeDirectionalArrowsMask(
  spec: NonNullable<TileSpecObjJson["directionalArrows"]>,
): number {
  const arrows = sortDirsUnique(spec.arrows);
  return maskFromDirs(arrows) & 0xff;
}

function toObj(spec: TileSpecJson): TileSpecObjJson {
  if (typeof spec === "string") return { tile: spec };
  return spec;
}

function encodeTileSpec(w: BinaryWriter, spec: TileSpecJson): void {
  const obj = toObj(spec);
  const tileId = tileIdFromName(obj.tile);
  assertU8(tileId, "tile id");

  const mods = [...(obj.modifiers ?? [])];
  mods.sort((a, b) => modifierKindOrder(a.kind) - modifierKindOrder(b.kind));

  for (const m of mods) {
    const v = modifierValue(tileId, m);
    if (v === 0) continue; // canonical: omit zero modifiers
    writeModifier(w, v);
  }

  w.writeU8(tileId);

  if (tileId === TILE_DIRECTIONAL_BLOCK) {
    if (!obj.dir) throw new Error("DIRECTIONAL_BLOCK missing dir");
    w.writeU8(dirToByte(obj.dir));

    const mask = obj.directionalArrows ? encodeDirectionalArrowsMask(obj.directionalArrows) : 0;
    w.writeU8(mask);

    if (!obj.lower) throw new Error("DIRECTIONAL_BLOCK missing lower");
    encodeTileSpec(w, obj.lower);
    return;
  }

  if (tileId === TILE_THINWALL_CANOPY) {
    const mask = obj.thinWallCanopy ? encodeThinWallCanopyMask(obj.thinWallCanopy) : 0;
    w.writeU8(mask);

    if (!obj.lower) throw new Error("THINWALL_CANOPY missing lower");
    encodeTileSpec(w, obj.lower);
    return;
  }

  if (DIR_AND_LOWER.has(tileId)) {
    if (!obj.dir) throw new Error(`tile ${obj.tile} missing dir`);
    w.writeU8(dirToByte(obj.dir));
    if (!obj.lower) throw new Error(`tile ${obj.tile} missing lower`);
    encodeTileSpec(w, obj.lower);
    return;
  }

  if (LOWER_ONLY.has(tileId)) {
    if (!obj.lower) throw new Error(`tile ${obj.tile} missing lower`);
    encodeTileSpec(w, obj.lower);
    return;
  }
}

export function encodeMapJsonToBytes(map: MapJson): Uint8Array {
  assertU8(map.width, "map.width");
  assertU8(map.height, "map.height");

  const expected = map.width * map.height;
  if (map.tiles.length !== expected) {
    throw new Error(`map.tiles length ${map.tiles.length} != width*height ${expected}`);
  }

  const w = new BinaryWriter();
  w.writeU8(map.width);
  w.writeU8(map.height);

  for (const t of map.tiles) encodeTileSpec(w, t);

  return w.toBuffer();
}

// ---------------- JSON parsing (accept Option B + legacy shapes) ----------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseDir(v: unknown, path: string): Dir {
  if (v !== "N" && v !== "E" && v !== "S" && v !== "W")
    throw new Error(`Invalid ${path}: expected N|E|S|W`);
  return v;
}

function parseU8(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 0xff)
    throw new Error(`Invalid ${path}: expected u8`);
  return v;
}

function parseBool(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") throw new Error(`Invalid ${path}: expected boolean`);
  return v;
}

function parseDirArray(v: unknown, path: string): Dir[] {
  if (!Array.isArray(v)) throw new Error(`Invalid ${path}: expected array`);
  const dirs = v.map((x, i) => parseDir(x, `${path}[${i}]`));
  return sortDirsUnique(dirs);
}

function parseTileName(v: unknown, path: string): string {
  if (typeof v === "string") return v;

  // Legacy: tile: { id, name }
  if (isRecord(v)) {
    const name = v.name;
    const id = v.id;

    if (typeof name === "string") return name;
    if (typeof id === "number" && Number.isInteger(id) && id >= 0 && id <= 0xff)
      return tileNameFromId(id);

    throw new Error(`Invalid ${path}: expected string or {name} or {id,name}`);
  }

  throw new Error(`Invalid ${path}: expected string`);
}

function parseModifierJson(tileId: number, v: unknown, path: string): ModifierJson {
  if (!isRecord(v)) throw new Error(`Invalid ${path}: expected object`);
  const kind = v.kind;
  if (typeof kind !== "string") throw new Error(`Invalid ${path}.kind`);

  switch (kind) {
    case "WIRES": {
      const wires = v.wires === undefined ? [] : parseDirArray(v.wires, `${path}.wires`);
      const tunnels = v.tunnels === undefined ? [] : parseDirArray(v.tunnels, `${path}.tunnels`);
      return { kind: "WIRES", wires, tunnels };
    }
    case "CLONE_ARROWS": {
      const arrows = v.arrows === undefined ? [] : parseDirArray(v.arrows, `${path}.arrows`);
      return { kind: "CLONE_ARROWS", arrows };
    }
    case "CUSTOM_STYLE": {
      const style = v.style;
      if (style !== "GREEN" && style !== "PINK" && style !== "YELLOW" && style !== "BLUE") {
        throw new Error(`Invalid ${path}.style`);
      }
      return { kind: "CUSTOM_STYLE", style };
    }
    case "LETTER_SYMBOL": {
      const symbol = v.symbol;
      if (typeof symbol !== "string") throw new Error(`Invalid ${path}.symbol`);
      // validate encodable
      encodeLetterSymbolValue({ kind: "LETTER_SYMBOL", symbol });
      return { kind: "LETTER_SYMBOL", symbol };
    }
    case "LOGIC": {
      const gate = v.gate;
      if (
        gate !== "INVERTER" &&
        gate !== "AND" &&
        gate !== "OR" &&
        gate !== "XOR" &&
        gate !== "LATCH_CW" &&
        gate !== "LATCH_CCW" &&
        gate !== "NAND" &&
        gate !== "COUNTER"
      ) {
        throw new Error(`Invalid ${path}.gate`);
      }

      if (gate === "COUNTER") {
        const counterValue = v.counterValue;
        if (
          typeof counterValue !== "number" ||
          !Number.isInteger(counterValue) ||
          counterValue < 0 ||
          counterValue > 9
        ) {
          throw new Error(`Invalid ${path}.counterValue (expected 0..9)`);
        }
        return { kind: "LOGIC", gate: "COUNTER", counterValue };
      }

      const facing = v.facing;
      if (facing === undefined) throw new Error(`Invalid ${path}.facing (required for ${gate})`);
      return { kind: "LOGIC", gate, facing: parseDir(facing, `${path}.facing`) };
    }
    case "TRACKS": {
      if (tileId !== TILE_RAILROAD_TRACK)
        throw new Error(`TRACKS modifier only valid for RAILROAD_TRACK tile`);
      const piecesV = v.pieces;
      if (!Array.isArray(piecesV)) throw new Error(`Invalid ${path}.pieces: expected array`);

      const pieceSet = new Set<TrackPiece>();
      for (let i = 0; i < piecesV.length; i++) {
        const p = piecesV[i];
        if (
          p !== "TURN_NE" &&
          p !== "TURN_SE" &&
          p !== "TURN_SW" &&
          p !== "TURN_NW" &&
          p !== "HORIZONTAL" &&
          p !== "VERTICAL" &&
          p !== "SWITCH"
        ) {
          throw new Error(`Invalid ${path}.pieces[${i}]`);
        }
        pieceSet.add(p);
      }

      const ordered: TrackPiece[] = [
        "TURN_NE",
        "TURN_SE",
        "TURN_SW",
        "TURN_NW",
        "HORIZONTAL",
        "VERTICAL",
        "SWITCH",
      ];
      const pieces = ordered.filter((p) => pieceSet.has(p));

      const active = v.active;
      if (
        active !== "NE" &&
        active !== "SE" &&
        active !== "SW" &&
        active !== "NW" &&
        active !== "H" &&
        active !== "V"
      ) {
        throw new Error(`Invalid ${path}.active`);
      }
      const entered = parseDir(v.entered, `${path}.entered`);
      return { kind: "TRACKS", pieces, active, entered };
    }
    default:
      throw new Error(`Unknown modifier kind '${kind}' at ${path}`);
  }
}

function parseTileSpecJson(v: unknown, path: string): TileSpecJson {
  // Option B: bare string means just the tile.
  if (typeof v === "string") return v;

  if (!isRecord(v)) throw new Error(`Invalid ${path}: expected string or object`);

  const tileName = parseTileName(v.tile, `${path}.tile`);
  const tileId = tileIdFromName(tileName);

  const out: {
    tile: string;
    dir?: Dir;
    thinWallCanopy?: NonNullable<TileSpecObjJson["thinWallCanopy"]>;
    directionalArrows?: NonNullable<TileSpecObjJson["directionalArrows"]>;
    modifiers?: ModifierJson[];
    lower?: TileSpecJson;
  } = { tile: tileName };

  if (v.dir !== undefined) out.dir = parseDir(v.dir, `${path}.dir`);

  if (v.thinWallCanopy !== undefined) {
    if (!isRecord(v.thinWallCanopy)) throw new Error(`Invalid ${path}.thinWallCanopy`);
    const walls =
      v.thinWallCanopy.walls === undefined
        ? []
        : parseDirArray(v.thinWallCanopy.walls, `${path}.thinWallCanopy.walls`);
    const canopy = parseBool(v.thinWallCanopy.canopy, `${path}.thinWallCanopy.canopy`);
    out.thinWallCanopy = { walls, canopy };
  }

  if (v.directionalArrows !== undefined) {
    if (!isRecord(v.directionalArrows)) throw new Error(`Invalid ${path}.directionalArrows`);
    const arrows =
      v.directionalArrows.arrows === undefined
        ? []
        : parseDirArray(v.directionalArrows.arrows, `${path}.directionalArrows.arrows`);
    out.directionalArrows = { arrows };
  }

  if (v.modifiers !== undefined) {
    if (!Array.isArray(v.modifiers)) throw new Error(`Invalid ${path}.modifiers: expected array`);
    const mods = v.modifiers.map((m, i) => parseModifierJson(tileId, m, `${path}.modifiers[${i}]`));
    if (mods.length > 0) out.modifiers = mods;
  }

  if (v.lower !== undefined) out.lower = parseTileSpecJson(v.lower, `${path}.lower`);

  return minimizeTile(out);
}

export function parseMapJson(input: unknown): MapJson {
  if (!isRecord(input)) throw new Error("Invalid map: expected object");
  const width = parseU8(input.width, "map.width");
  const height = parseU8(input.height, "map.height");

  const tilesV = input.tiles;
  if (!Array.isArray(tilesV)) throw new Error("Invalid map.tiles: expected array");

  const expected = width * height;
  if (tilesV.length !== expected) {
    throw new Error(`Invalid map.tiles length ${tilesV.length} != width*height ${expected}`);
  }

  const tiles = tilesV.map((t, i) => parseTileSpecJson(t, `map.tiles[${i}]`));
  return { width, height, tiles };
}
