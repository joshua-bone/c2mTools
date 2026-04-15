import { classifyTileLayer, flattenCellLayers } from "../../src/c2m/cellStack.js";
import type { Dir, TileSpecJson } from "../../src/c2m/mapCodec.js";

type DirectionArrowContext = {
  beginPath: () => void;
  closePath: () => void;
  fill: () => void;
  fillStyle: unknown;
  lineTo: (x: number, y: number) => void;
  moveTo: (x: number, y: number) => void;
  restore: () => void;
  save: () => void;
};

const ALWAYS_ARROW_MOBS = new Set(["PURPLE_BALL", "WALKER", "FIRE_BOX"]);
const PALETTE_ARROW_MOBS = new Set(["PURPLE_BALL", "WALKER", "FIRE_BOX", "BLOB"]);
const CLONER_OR_TRAP_ARROW_MOBS = new Set([
  "DIRT_BLOCK",
  "ICE_BLOCK",
  "DIRECTIONAL_BLOCK",
  "ANGRY_TEETH",
  "TIMID_TEETH",
  "BLOB",
  "FLOOR_MIMIC",
]);
const CLONER_OR_TRAP_TERRAINS = new Set([
  "TRAP",
  "OPEN_TRAP_UNUSED",
  "CLONE_MACHINE",
  "CLONE_MACHINE_OLD",
]);

function resolveDirectMobDirectionFromSet(
  spec: TileSpecJson,
  arrowMobs: ReadonlySet<string>,
): Dir | null {
  if (typeof spec === "string") return null;
  if (classifyTileLayer(spec.tile) !== "mob") return null;
  return arrowMobs.has(spec.tile) ? (spec.dir ?? null) : null;
}

function resolveDirectMobDirection(spec: TileSpecJson): Dir | null {
  return resolveDirectMobDirectionFromSet(spec, ALWAYS_ARROW_MOBS);
}

export function resolvePaletteDirectionArrow(spec: TileSpecJson): Dir | null {
  try {
    const mob = flattenCellLayers(spec).mob;
    if (!mob?.dir) return null;
    return PALETTE_ARROW_MOBS.has(mob.tile) ? mob.dir : null;
  } catch {
    return resolveDirectMobDirectionFromSet(spec, PALETTE_ARROW_MOBS);
  }
}

export function resolveMobDirectionArrow(spec: TileSpecJson): Dir | null {
  try {
    const layers = flattenCellLayers(spec);
    const mob = layers.mob;
    if (!mob?.dir) return null;
    if (ALWAYS_ARROW_MOBS.has(mob.tile)) return mob.dir;
    if (
      CLONER_OR_TRAP_ARROW_MOBS.has(mob.tile) &&
      CLONER_OR_TRAP_TERRAINS.has(layers.terrain.tile)
    ) {
      return mob.dir;
    }
    return null;
  } catch {
    return resolveDirectMobDirection(spec);
  }
}

export function drawDirectionArrow(
  ctx: DirectionArrowContext,
  dir: Dir,
  tileSize: number,
  dx = 0,
  dy = 0,
): void {
  const arrowSize = Math.floor(tileSize / 4);
  const offset = Math.floor(tileSize / 8);

  ctx.save();
  ctx.fillStyle = "#ff0000";
  ctx.beginPath();

  if (dir === "N") {
    ctx.moveTo(dx + tileSize / 2, dy + offset);
    ctx.lineTo(dx + tileSize / 2 - arrowSize, dy + offset + arrowSize);
    ctx.lineTo(dx + tileSize / 2 + arrowSize, dy + offset + arrowSize);
  } else if (dir === "S") {
    ctx.moveTo(dx + tileSize / 2, dy + tileSize - offset);
    ctx.lineTo(dx + tileSize / 2 - arrowSize, dy + tileSize - offset - arrowSize);
    ctx.lineTo(dx + tileSize / 2 + arrowSize, dy + tileSize - offset - arrowSize);
  } else if (dir === "W") {
    ctx.moveTo(dx + offset, dy + tileSize / 2);
    ctx.lineTo(dx + offset + arrowSize, dy + tileSize / 2 - arrowSize);
    ctx.lineTo(dx + offset + arrowSize, dy + tileSize / 2 + arrowSize);
  } else {
    ctx.moveTo(dx + tileSize - offset, dy + tileSize / 2);
    ctx.lineTo(dx + tileSize - offset - arrowSize, dy + tileSize / 2 - arrowSize);
    ctx.lineTo(dx + tileSize - offset - arrowSize, dy + tileSize / 2 + arrowSize);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
