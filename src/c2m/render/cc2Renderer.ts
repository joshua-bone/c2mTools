// src/c2m/render/cc2Renderer.ts
import type { C2mJsonV1 } from "../c2mJsonV1.js";
import type { MapJson, TileSpecJson, TileSpecObjJson, ModifierJson, Dir } from "../mapCodec.js";
import { createImage, blit } from "./rgbaImage.js";
import { CC2Tileset } from "./cc2Tileset.js";
import { writePngRgba } from "./png.js";

const T = 32;

type CellLayers = {
  terrain: TileSpecObjJson;
  sob?: TileSpecObjJson;
  noSign?: TileSpecObjJson;
  mob?: TileSpecObjJson;
  thinWalls?: TileSpecObjJson;
};

function toObjTile(t: TileSpecJson): TileSpecObjJson {
  return typeof t === "string" ? { tile: t } : t;
}

function isMob(name: string): boolean {
  return (
    name === "CHIP" ||
    name === "MELINDA" ||
    name === "DIRT_BLOCK" ||
    name === "WALKER" ||
    name === "SHIP" ||
    name === "ICE_BLOCK" ||
    name === "BLUE_TANK" ||
    name === "ANT" ||
    name === "CENTIPEDE" ||
    name === "PURPLE_BALL" ||
    name === "BLOB" ||
    name === "ANGRY_TEETH" ||
    name === "TIMID_TEETH" ||
    name === "FIRE_BOX" ||
    name === "YELLOW_TANK" ||
    name === "MIRROR_CHIP" ||
    name === "MIRROR_MELINDA" ||
    name === "ROVER" ||
    name === "DIRECTIONAL_BLOCK" ||
    name === "FLOOR_MIMIC" ||
    name === "GHOST"
  );
}

function isSob(name: string): boolean {
  return (
    name === "RED_KEY" ||
    name === "BLUE_KEY" ||
    name === "YELLOW_KEY" ||
    name === "GREEN_KEY" ||
    name === "IC_CHIP" ||
    name === "EXTRA_IC_CHIP" ||
    name === "CLEATS" ||
    name === "SUCTION_BOOTS" ||
    name === "FIRE_BOOTS" ||
    name === "FLIPPERS" ||
    name === "CHERRY_BOMB" ||
    name === "TIME_BONUS" ||
    name === "STOPWATCH" ||
    name === "TIME_BOMB" ||
    name === "HELMET" ||
    name === "HIKING_BOOTS" ||
    name === "LIGHTNING_BOLT" ||
    name === "BOWLING_BALL" ||
    name === "TIME_PENALTY" ||
    name === "RAILROAD_SIGN" ||
    name === "FLAG_10" ||
    name === "FLAG_100" ||
    name === "FLAG_1000" ||
    name === "FLAG_2X" ||
    name === "GREEN_BOMB" ||
    name === "GREEN_CHIP" ||
    name === "STEEL_FOIL" ||
    name === "SECRET_EYE" ||
    name === "THIEF_BRIBE" ||
    name === "SPEED_BOOTS" ||
    name === "HOOK"
  );
}

function isThinWalls(name: string): boolean {
  return name === "THINWALL_CANOPY";
}

function isNoSign(name: string): boolean {
  // In your friend's renderer this is tile_index 127 -> NoSign overlay.
  // Our naming is from wiki; render it as NoSign.
  return name === "NOT_ALLOWED_MARKER";
}

function flattenCell(spec: TileSpecJson): CellLayers {
  let cur: TileSpecJson | undefined = spec;
  const layers: Partial<CellLayers> = {};

  while (cur) {
    const obj = toObjTile(cur);
    const name = obj.tile;

    if (isThinWalls(name)) {
      layers.thinWalls = obj;
      cur = obj.lower;
      continue;
    }

    if (isNoSign(name)) {
      layers.noSign = obj;
      cur = obj.lower;
      continue;
    }

    if (isMob(name)) {
      layers.mob = obj;
      cur = obj.lower;
      continue;
    }

    if (isSob(name)) {
      layers.sob = obj;
      cur = obj.lower;
      continue;
    }

    // Default: terrain
    layers.terrain = obj;
    break;
  }

  if (!layers.terrain) {
    // Defensive fallback: if a malformed chain has no terrain, treat current as terrain.
    layers.terrain = toObjTile(spec);
  }

  return layers as CellLayers;
}

function getModifier(tile: TileSpecObjJson, kind: ModifierJson["kind"]): ModifierJson | undefined {
  const mods = tile.modifiers ?? [];
  for (const m of mods) if (m.kind === kind) return m;
  return undefined;
}

function dirIndex(d: Dir | undefined): 0 | 1 | 2 | 3 {
  if (d === "N") return 0;
  if (d === "E") return 1;
  if (d === "S") return 2;
  if (d === "W") return 3;
  return 0;
}

function wiresMask(tile: TileSpecObjJson): { wires: number; tunnels: number } {
  const m = getModifier(tile, "WIRES");
  if (!m || m.kind !== "WIRES") return { wires: 0, tunnels: 0 };

  const bit = (d: Dir): number => (d === "N" ? 1 : d === "E" ? 2 : d === "S" ? 4 : 8);
  let w = 0;
  for (const d of m.wires) w |= bit(d);
  let t = 0;
  for (const d of m.tunnels) t |= bit(d);
  return { wires: w & 0x0f, tunnels: t & 0x0f };
}

function renderWireable(
  ts: CC2Tileset,
  ownX: number,
  ownY: number,
  tile: TileSpecObjJson,
  isSwitch: boolean,
): ReturnType<CC2Tileset["drawEmpty"]> {
  const own = ts.draw(ownX, ownY);
  const { wires } = wiresMask(tile);

  const baseXY = isSwitch ? { x: 14, y: 21 } : { x: 0, y: 2 };
  if (wires === 0) {
    return ts.merge(own, ts.draw(baseXY.x, baseXY.y));
  }

  // Electricity base
  let base = ts.draw(13, 26);

  // For each missing wire, paste base-tile electric side onto electricity to "clear" it.
  if ((wires & 0x1) === 0) base = ts.merge(ts.drawElectricSide(baseXY.x, baseXY.y, "TOP"), base);
  if ((wires & 0x2) === 0)
    base = ts.mergeWithOffset(ts.drawElectricSide(baseXY.x, baseXY.y, "RIGHT"), base, T / 2 + 1, 0);
  if ((wires & 0x4) === 0)
    base = ts.mergeWithOffset(
      ts.drawElectricSide(baseXY.x, baseXY.y, "BOTTOM"),
      base,
      0,
      T / 2 + 1,
    );
  if ((wires & 0x8) === 0) base = ts.merge(ts.drawElectricSide(baseXY.x, baseXY.y, "LEFT"), base);

  return ts.merge(own, base);
}

function renderSuperWireable(
  ts: CC2Tileset,
  ownX: number,
  ownY: number,
  overlayX: number,
  overlayY: number,
  tile: TileSpecObjJson,
): ReturnType<CC2Tileset["drawEmpty"]> {
  const { wires, tunnels } = wiresMask(tile);
  const modifierLow = wires & 0x0f;
  const modifierHigh = tunnels & 0x0f;

  if (modifierLow === 0 && modifierHigh === 0) {
    return ts.draw(ownX, ownY);
  }

  let base = ts.merge(ts.draw(overlayX, overlayY), ts.draw(13, 26)); // overlay over electricity

  if (modifierLow === 0x0f) {
    base = ts.merge(ts.draw(overlayX + 2, overlayY), base);
  } else {
    if ((modifierLow & 0x1) === 0) base = ts.merge(ts.drawElectricSide(ownX, ownY, "TOP"), base);
    if ((modifierLow & 0x2) === 0)
      base = ts.mergeWithOffset(ts.drawElectricSide(ownX, ownY, "RIGHT"), base, T / 2 + 1, 0);
    if ((modifierLow & 0x4) === 0)
      base = ts.mergeWithOffset(ts.drawElectricSide(ownX, ownY, "BOTTOM"), base, 0, T / 2 + 1);
    if ((modifierLow & 0x8) === 0) base = ts.merge(ts.drawElectricSide(ownX, ownY, "LEFT"), base);
  }

  // Tunnels: use side strips from (14,11)
  if ((modifierHigh & 0x1) !== 0) base = ts.merge(ts.drawSide(14, 11, "TOP"), base);
  if ((modifierHigh & 0x2) !== 0) base = ts.merge(ts.drawSide(14, 11, "RIGHT"), base, "VERY_RIGHT");
  if ((modifierHigh & 0x4) !== 0)
    base = ts.merge(ts.drawSide(14, 11, "BOTTOM"), base, "VERY_BOTTOM");
  if ((modifierHigh & 0x8) !== 0) base = ts.merge(ts.drawSide(14, 11, "LEFT"), base);

  return base;
}

function renderThinWalls(
  ts: CC2Tileset,
  tile: TileSpecObjJson,
): ReturnType<CC2Tileset["drawEmpty"]> {
  const base = ts.drawEmpty();
  const t = tile.thinWallCanopy;
  if (!t) return base;

  const has = (d: Dir): boolean => t.walls.includes(d);

  let out = base;
  if (has("N")) out = ts.merge(ts.drawSide(1, 10, "TOP"), out);
  if (has("E")) out = ts.merge(ts.drawSide(2, 10, "RIGHT"), out, "VERY_RIGHT");
  if (has("S")) out = ts.merge(ts.drawSide(1, 10, "BOTTOM"), out, "VERY_BOTTOM");
  if (has("W")) out = ts.merge(ts.drawSide(2, 10, "LEFT"), out);

  if (t.canopy) out = ts.merge(ts.draw(15, 3), out);
  return out;
}

function renderNoSign(ts: CC2Tileset): ReturnType<CC2Tileset["drawEmpty"]> {
  return ts.draw(14, 5);
}

function renderCloneMachine(
  ts: CC2Tileset,
  tile: TileSpecObjJson,
): ReturnType<CC2Tileset["drawEmpty"]> {
  let base = ts.draw(15, 1);
  const m = getModifier(tile, "CLONE_ARROWS");
  if (!m || m.kind !== "CLONE_ARROWS") return base;

  const has = (d: Dir): boolean => m.arrows.includes(d);

  if (has("N")) base = ts.merge(ts.drawSide(8, 31, "TOP"), base);
  if (has("E")) base = ts.merge(ts.drawSide(8, 31, "RIGHT"), base, "VERY_RIGHT");
  if (has("S")) base = ts.merge(ts.drawSide(8, 31, "BOTTOM"), base, "VERY_BOTTOM");
  if (has("W")) base = ts.merge(ts.drawSide(8, 31, "LEFT"), base);

  return base;
}

function renderDirectionalBlock(
  ts: CC2Tileset,
  tile: TileSpecObjJson,
): ReturnType<CC2Tileset["drawEmpty"]> {
  let base = ts.draw(15, 5);
  const a = tile.directionalArrows;
  if (!a) return base;
  const has = (d: Dir): boolean => a.arrows.includes(d);

  if (has("N")) base = ts.merge(ts.drawSide(3, 10, "TOP"), base);
  if (has("E")) base = ts.merge(ts.drawSide(3, 10, "RIGHT"), base, "VERY_RIGHT");
  if (has("S")) base = ts.merge(ts.drawSide(3, 10, "BOTTOM"), base, "VERY_BOTTOM");
  if (has("W")) base = ts.merge(ts.drawSide(3, 10, "LEFT"), base);

  return base;
}

function renderRailroadTrack(
  ts: CC2Tileset,
  tile: TileSpecObjJson,
): ReturnType<CC2Tileset["drawEmpty"]> {
  // Replicates TrainTrack.get_gfx from your friend's code.
  let base = ts.draw(9, 10);
  const m = getModifier(tile, "TRACKS");
  if (!m || m.kind !== "TRACKS") return base;

  const idx = (a: string): number =>
    a === "NE" ? 0 : a === "SE" ? 1 : a === "SW" ? 2 : a === "NW" ? 3 : a === "H" ? 4 : 5;

  const tracks: boolean[] = [false, false, false, false, false, false];
  for (const p of m.pieces) {
    if (p === "TURN_NE") tracks[0] = true;
    else if (p === "TURN_SE") tracks[1] = true;
    else if (p === "TURN_SW") tracks[2] = true;
    else if (p === "TURN_NW") tracks[3] = true;
    else if (p === "HORIZONTAL") tracks[4] = true;
    else if (p === "VERTICAL") tracks[5] = true;
  }

  const hasSwitch = m.pieces.includes("SWITCH");
  const switchVal = idx(m.active);

  const woodX = 0;
  const redX = 7;
  const railX = 13;

  // wood ties
  for (let i = 0; i < 6; i++) {
    if (tracks[i]) base = ts.merge(ts.draw(woodX + i, 30), base);
  }

  // red inactive highlights (only when switch exists)
  if (hasSwitch) {
    for (let i = 0; i < 6; i++) {
      if (tracks[i] && i !== switchVal) base = ts.merge(ts.draw(redX + i, 30), base);
    }
  }

  // rails
  for (let i = 0; i < 6; i++) {
    if (!tracks[i]) continue;
    if (hasSwitch && i !== switchVal) continue;

    if (i <= 2) base = ts.merge(ts.draw(railX + i, 30), base);
    else base = ts.merge(ts.draw(i - 3, 31), base);
  }

  if (hasSwitch) base = ts.merge(ts.draw(6, 30), base);

  return base;
}

function renderLogicGate(
  ts: CC2Tileset,
  tile: TileSpecObjJson,
): ReturnType<CC2Tileset["drawEmpty"]> {
  // Best-effort reproduction of your friend's LogicGate.get_gfx.
  // Base is electricity.
  let base = ts.draw(13, 26);

  const m = getModifier(tile, "LOGIC");
  // If absent, treat as inverter (north).
  let value = 0;

  if (m && m.kind === "LOGIC") {
    if (m.gate === "COUNTER") {
      value = 0x1e + (m.counterValue ?? 0);
    } else {
      const facing = m.facing ?? "N";
      const d = dirIndex(facing);
      const baseVal =
        m.gate === "INVERTER"
          ? 0x00
          : m.gate === "AND"
            ? 0x04
            : m.gate === "OR"
              ? 0x08
              : m.gate === "XOR"
                ? 0x0c
                : m.gate === "LATCH_CW"
                  ? 0x10
                  : m.gate === "NAND"
                    ? 0x14
                    : 0x40; // LATCH_CCW
      value = baseVal + d;
    }
  }

  if (value >= 0 && value < 24) {
    const x = value % 16;
    const y = 25 + Math.floor(value / 16);
    base = ts.merge(ts.draw(x, y), base);
    return base;
  }

  if (value >= 30 && value < 40) {
    // Counter 0..9 at y=3 using drawCounter, offset x=4
    base = ts.merge(ts.draw(14, 26), base);
    const counter = ts.drawCounter(value - 30, 3);
    base = ts.mergeWithOffset(counter, base, T / 8, 0); // x=4, y=0
    return base;
  }

  if (value >= 64 && value < 68) {
    base = ts.merge(ts.draw((value % 16) + 8, 21), base);
    return base;
  }

  return base;
}

function renderTerrain(ts: CC2Tileset, tile: TileSpecObjJson): ReturnType<CC2Tileset["drawEmpty"]> {
  const name = tile.tile;

  // SuperWireable
  if (name === "FLOOR") return renderSuperWireable(ts, 0, 2, 8, 26, tile);
  if (name === "STEEL_WALL") return renderSuperWireable(ts, 15, 10, 9, 26, tile);

  // Wireable
  if (name === "RED_TELEPORT") return renderWireable(ts, 4, 20, tile, false);
  if (name === "BLUE_TELEPORT") return renderWireable(ts, 4, 10, tile, false);
  if (name === "PINK_BUTTON") return renderWireable(ts, 12, 6, tile, false);
  if (name === "BLACK_BUTTON") return renderWireable(ts, 13, 6, tile, false);
  if (name === "SWITCH_OFF") return renderWireable(ts, 12, 21, tile, true);
  if (name === "SWITCH_ON") return renderWireable(ts, 13, 21, tile, true);

  if (name === "CLONE_MACHINE" || name === "CLONE_MACHINE_OLD") return renderCloneMachine(ts, tile);

  if (name === "RAILROAD_TRACK") return renderRailroadTrack(ts, tile);

  if (name === "LOGIC_GATE") return renderLogicGate(ts, tile);

  if (name === "GREEN_TOGGLE_FLOOR") return ts.draw(0, 9);
  if (name === "GREEN_TOGGLE_WALL") return ts.merge(ts.draw(8, 9), ts.draw(0, 9));

  if (name === "PURPLE_TOGGLE_FLOOR") return ts.draw(4, 9);
  if (name === "PURPLE_TOGGLE_WALL") return ts.merge(ts.draw(8, 9), ts.draw(4, 9));

  if (name === "CUSTOM_FLOOR" || name === "CUSTOM_WALL") {
    const m = getModifier(tile, "CUSTOM_STYLE");
    const styleIndex =
      m && m.kind === "CUSTOM_STYLE"
        ? m.style === "GREEN"
          ? 0
          : m.style === "PINK"
            ? 1
            : m.style === "YELLOW"
              ? 2
              : 3
        : 0;
    if (name === "CUSTOM_FLOOR") return ts.draw(8 + styleIndex, 4);
    return ts.draw(12 + styleIndex, 4);
  }

  if (name === "LETTER_TILE") {
    // SunkenFloor base + letter symbol overlay at center
    let base = ts.draw(2, 2);
    const m = getModifier(tile, "LETTER_SYMBOL");
    if (m && m.kind === "LETTER_SYMBOL") {
      const sym = m.symbol;
      const arrowCode =
        sym === "↑" ? 0x1c : sym === "→" ? 0x1d : sym === "↓" ? 0x1e : sym === "←" ? 0x1f : null;

      if (arrowCode !== null) {
        const overlay = ts.drawSmall(arrowCode, 62);
        base = ts.merge(overlay, base, "CENTER");
      } else if (sym.length === 1) {
        const code = sym.charCodeAt(0);
        if (code >= 0x20 && code <= 0x5f) {
          const letterX = code % 32;
          const letterY = Math.floor(code / 32) - 1;
          const overlay = ts.drawSmall(letterX, letterY);
          base = ts.merge(overlay, base, "CENTER");
        }
      }
    }
    return base;
  }

  if (name === "TURTLE") {
    return ts.merge(ts.draw(13, 12), ts.draw(12, 24)); // turtle over water
  }

  // Swivels: base always (13,11); overlay drawn later
  if (
    name === "SWIVEL_DOOR_SW" ||
    name === "SWIVEL_DOOR_NW" ||
    name === "SWIVEL_DOOR_NE" ||
    name === "SWIVEL_DOOR_SE"
  ) {
    return ts.draw(13, 11);
  }

  // Static terrain lookup
  const staticXY: Record<string, { x: number; y: number }> = {
    WALL: { x: 1, y: 2 },
    ICE: { x: 10, y: 1 },
    ICE_CORNER_NE: { x: 12, y: 1 },
    ICE_CORNER_NW: { x: 11, y: 1 },
    ICE_CORNER_SE: { x: 14, y: 1 },
    ICE_CORNER_SW: { x: 13, y: 1 },
    WATER: { x: 12, y: 24 },
    FIRE: { x: 12, y: 29 },
    FORCE_N: { x: 0, y: 19 },
    FORCE_E: { x: 2, y: 19 },
    FORCE_S: { x: 1, y: 19 },
    FORCE_W: { x: 2, y: 20 },
    FORCE_RANDOM: { x: 0, y: 21 },
    EXIT: { x: 6, y: 2 },
    SLIME: { x: 8, y: 20 },
    GRAVEL: { x: 9, y: 10 },
    GREEN_BUTTON: { x: 9, y: 6 },
    BLUE_BUTTON: { x: 8, y: 6 },
    RED_BUTTON: { x: 10, y: 6 },
    BROWN_BUTTON: { x: 11, y: 6 },
    GRAY_BUTTON: { x: 11, y: 9 },
    ORANGE_BUTTON: { x: 14, y: 6 },
    YELLOW_TANK_BUTTON: { x: 15, y: 6 },
    RED_DOOR: { x: 0, y: 1 },
    BLUE_DOOR: { x: 1, y: 1 },
    YELLOW_DOOR: { x: 2, y: 1 },
    GREEN_DOOR: { x: 3, y: 1 },
    CHIP_SOCKET: { x: 4, y: 2 },
    POP_UP_WALL: { x: 8, y: 10 },
    APPEARING_WALL: { x: 11, y: 31 },
    INVISIBLE_WALL: { x: 9, y: 31 },
    SOLID_BLUE_WALL: { x: 0, y: 10 },
    FALSE_BLUE_WALL: { x: 10, y: 31 },
    DIRT: { x: 4, y: 31 },
    TRANSMOGRIFIER: { x: 12, y: 19 },
    TOOL_THIEF: { x: 3, y: 2 },
    KEY_THIEF: { x: 15, y: 21 },
    OPEN_TRAP_UNUSED: { x: 10, y: 9 },
    TRAP: { x: 9, y: 9 },
    CLUE: { x: 5, y: 2 },
    FLAME_JET_OFF: { x: 8, y: 5 },
    FLAME_JET_ON: { x: 9, y: 5 },
    MALE_ONLY_SIGN: { x: 5, y: 31 },
    FEMALE_ONLY_SIGN: { x: 6, y: 31 },
    SOLID_GREEN_WALL: { x: 12, y: 5 },
    FALSE_GREEN_WALL: { x: 13, y: 5 },
    RED_TELEPORT: { x: 4, y: 20 }, // non-wireable fallback (should be wireable)
    BLUE_TELEPORT: { x: 4, y: 10 }, // non-wireable fallback (should be wireable)
    YELLOW_TELEPORT: { x: 8, y: 19 },
    GREEN_TELEPORT: { x: 4, y: 19 },
  };

  const xy = staticXY[name];
  if (xy) return ts.draw(xy.x, xy.y);

  // Placeholder for unknown/unimplemented terrain
  return createImage(T, T, [255, 0, 255, 255]);
}

function renderSwivelOverlay(
  ts: CC2Tileset,
  terrainName: string,
): ReturnType<CC2Tileset["drawEmpty"]> | null {
  if (terrainName === "SWIVEL_DOOR_SW") return ts.draw(9, 11);
  if (terrainName === "SWIVEL_DOOR_NW") return ts.draw(10, 11);
  if (terrainName === "SWIVEL_DOOR_NE") return ts.draw(11, 11);
  if (terrainName === "SWIVEL_DOOR_SE") return ts.draw(12, 11);
  return null;
}

function renderSob(ts: CC2Tileset, tile: TileSpecObjJson): ReturnType<CC2Tileset["drawEmpty"]> {
  const name = tile.tile;

  const xy: Record<string, { x: number; y: number }> = {
    RED_KEY: { x: 4, y: 1 },
    BLUE_KEY: { x: 5, y: 1 },
    YELLOW_KEY: { x: 6, y: 1 },
    GREEN_KEY: { x: 7, y: 1 },
    IC_CHIP: { x: 11, y: 3 },
    EXTRA_IC_CHIP: { x: 10, y: 3 },
    CLEATS: { x: 2, y: 6 },
    SUCTION_BOOTS: { x: 3, y: 6 },
    FIRE_BOOTS: { x: 1, y: 6 },
    FLIPPERS: { x: 0, y: 6 },
    TIME_BONUS: { x: 15, y: 14 },
    STOPWATCH: { x: 14, y: 14 },
    TIME_BOMB: { x: 0, y: 4 },
    HELMET: { x: 0, y: 14 },
    HIKING_BOOTS: { x: 4, y: 6 },
    LIGHTNING_BOLT: { x: 5, y: 6 },
    BOWLING_BALL: { x: 6, y: 17 },
    TIME_PENALTY: { x: 15, y: 11 },
    RAILROAD_SIGN: { x: 3, y: 31 },
    FLAG_10: { x: 14, y: 2 },
    FLAG_100: { x: 13, y: 2 },
    FLAG_1000: { x: 12, y: 2 },
    FLAG_2X: { x: 15, y: 2 },
    GREEN_CHIP: { x: 9, y: 3 },
    STEEL_FOIL: { x: 12, y: 12 },
    SECRET_EYE: { x: 11, y: 18 },
    THIEF_BRIBE: { x: 12, y: 3 },
    SPEED_BOOTS: { x: 13, y: 3 },
    HOOK: { x: 7, y: 31 },
  };

  if (name === "CHERRY_BOMB") {
    const base = ts.draw(5, 4);
    const fuse = ts.drawSmall(14, 8);
    return ts.merge(fuse, base, "TOP_RIGHT");
  }

  if (name === "GREEN_BOMB") {
    const base = ts.draw(6, 4);
    const fuse = ts.drawSmall(14, 8);
    return ts.merge(fuse, base, "TOP_RIGHT");
  }

  const p = xy[name];
  if (p) return ts.draw(p.x, p.y);

  return createImage(T, T, [255, 0, 255, 255]);
}

function renderMob(
  ts: CC2Tileset,
  tile: TileSpecObjJson,
  ctx: { hideableHidden: boolean },
): ReturnType<CC2Tileset["drawEmpty"]> {
  const name = tile.tile;
  const dir = dirIndex(tile.dir);

  // Chip/Melinda: 2x2 orientation blocks with 8-wide stride
  if (name === "CHIP" || name === "MELINDA") {
    const baseY = name === "CHIP" ? 22 : 27;
    const xOffset = (dir % 2) * 8;
    const yOffset = Math.floor(dir / 2);
    return ts.draw(0 + xOffset, baseY + yOffset);
  }

  if (name === "MIRROR_CHIP" || name === "MIRROR_MELINDA") {
    const baseY = name === "MIRROR_CHIP" ? 22 : 27;
    const xOffset = (dir % 2) * 8;
    const yOffset = Math.floor(dir / 2);
    const base = ts.draw(0 + xOffset, baseY + yOffset);
    const mirror = ts.draw(7, 6);
    return ts.merge(base, mirror); // base over mirror overlay
  }

  if (name === "DIRT_BLOCK") {
    // Hideable: x=8,y=1; hidden uses +0, shown uses +1
    const x = 8 + (ctx.hideableHidden ? 0 : 1);
    return ts.draw(x, 1);
  }

  if (name === "ICE_BLOCK") {
    const x = 10 + (ctx.hideableHidden ? 0 : 1);
    return ts.draw(x, 2);
  }

  // Rover: base + small arrow overlay
  if (name === "ROVER") {
    let base = ts.draw(0, 18);
    if (dir === 0) base = ts.mergeWithOffset(ts.drawSmall(20, 36), base, T / 4, T / 8);
    else if (dir === 1) base = ts.mergeWithOffset(ts.drawSmall(21, 36), base, (3 * T) / 8, T / 4);
    else if (dir === 2) base = ts.mergeWithOffset(ts.drawSmall(21, 37), base, T / 4, (3 * T) / 8);
    else base = ts.mergeWithOffset(ts.drawSmall(20, 37), base, T / 8, T / 4);
    return base;
  }

  if (name === "DIRECTIONAL_BLOCK") {
    return renderDirectionalBlock(ts, tile);
  }

  // Teeth special offsets
  if (name === "ANGRY_TEETH") {
    const xOff = dir === 1 ? 3 : dir === 3 ? 6 : 0;
    return ts.draw(0 + xOff, 11);
  }
  if (name === "TIMID_TEETH") {
    const xOff = dir === 1 ? 2 : dir === 3 ? 4 : 0;
    return ts.draw(0 + xOff, 17);
  }

  // Generic mob (x + dir*frames)
  const mobInfo: Record<string, { x: number; y: number; frames: number }> = {
    WALKER: { x: 0, y: 13, frames: 0 },
    SHIP: { x: 8, y: 8, frames: 2 }, // glider-like in friend code
    BLUE_TANK: { x: 0, y: 8, frames: 2 },
    ANT: { x: 0, y: 7, frames: 4 },
    CENTIPEDE: { x: 0, y: 12, frames: 3 },
    PURPLE_BALL: { x: 10, y: 10, frames: 0 },
    BLOB: { x: 0, y: 15, frames: 0 },
    FIRE_BOX: { x: 12, y: 9, frames: 0 },
    YELLOW_TANK: { x: 8, y: 17, frames: 2 },
    FLOOR_MIMIC: { x: 14, y: 16, frames: 0 },
    GHOST: { x: 12, y: 18, frames: 1 },
  };

  const info = mobInfo[name];
  if (info) return ts.draw(info.x + dir * info.frames, info.y);

  return createImage(T, T, [255, 0, 255, 255]);
}

export class CC2Renderer {
  public constructor(private readonly tileset: CC2Tileset) {}

  public renderMap(map: MapJson): ReturnType<typeof createImage> {
    const out = createImage(map.width * T, map.height * T, [0, 0, 0, 255]); // black background

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const idx = y * map.width + x;
        const spec = map.tiles[idx];
        if (spec === undefined) throw new Error(`Missing tile at idx ${idx}`);

        const layers = flattenCell(spec);

        // terrain first
        const terrainGfx = renderTerrain(this.tileset, layers.terrain);
        blit(out, terrainGfx, x * T, y * T);

        // sob
        if (layers.sob) {
          blit(out, renderSob(this.tileset, layers.sob), x * T, y * T);
        }

        // no sign
        if (layers.noSign) {
          blit(out, renderNoSign(this.tileset), x * T, y * T);
        }

        // mob (hideable check depends on floor + no wires + no sob + no sign)
        if (layers.mob) {
          const isPlainFloor =
            layers.terrain.tile === "FLOOR" && getModifier(layers.terrain, "WIRES") === undefined;
          const hideableHidden =
            (layers.mob.tile === "DIRT_BLOCK" || layers.mob.tile === "ICE_BLOCK") &&
            isPlainFloor &&
            !layers.sob &&
            !layers.noSign;

          blit(out, renderMob(this.tileset, layers.mob, { hideableHidden }), x * T, y * T);
        }

        // swivel overlay after mobs
        {
          const overlay = renderSwivelOverlay(this.tileset, layers.terrain.tile);
          if (overlay) blit(out, overlay, x * T, y * T);
        }

        // thin walls last
        if (layers.thinWalls) {
          blit(out, renderThinWalls(this.tileset, layers.thinWalls), x * T, y * T);
        }
      }
    }

    return out;
  }

  public renderMapToPng(map: MapJson): Buffer {
    const img = this.renderMap(map);
    return writePngRgba(img);
  }

  public renderLevelDocToPng(doc: C2mJsonV1): Buffer {
    if (!doc.map) throw new Error("Level has no map");
    return this.renderMapToPng(doc.map);
  }
}
