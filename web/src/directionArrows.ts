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

function resolveDirectMobDirection(spec: TileSpecJson): Dir | null {
  if (typeof spec === "string") return null;
  return classifyTileLayer(spec.tile) === "mob" ? (spec.dir ?? null) : null;
}

export function resolveMobDirectionArrow(spec: TileSpecJson): Dir | null {
  try {
    return flattenCellLayers(spec).mob?.dir ?? null;
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
