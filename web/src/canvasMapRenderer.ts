import type { MapJson } from "../../src/c2m/mapCodec.js";
import type { Cc2CanvasCellCache } from "./cc2CanvasCache.js";
import { BOARD_TILE_PIXEL_SIZE, ensureCanvasSize } from "./boardCanvasPresentation.js";

export function drawCc2CellsToContext(
  ctx: CanvasRenderingContext2D,
  map: MapJson,
  indices: ReadonlyArray<number>,
  cache: Cc2CanvasCellCache,
  options: Readonly<{
    clearCells?: boolean;
  }> = {},
): void {
  const clearCells = options.clearCells ?? true;
  for (const index of indices) {
    const tile = map.tiles[index];
    if (tile === undefined) continue;

    const x = (index % map.width) * BOARD_TILE_PIXEL_SIZE;
    const y = Math.floor(index / map.width) * BOARD_TILE_PIXEL_SIZE;

    if (clearCells) {
      ctx.clearRect(x, y, BOARD_TILE_PIXEL_SIZE, BOARD_TILE_PIXEL_SIZE);
    }

    cache.drawCell(ctx, tile, x, y);
  }
}

export function drawCc2MapToCanvas(
  canvas: HTMLCanvasElement,
  map: MapJson,
  cache: Cc2CanvasCellCache,
): CanvasRenderingContext2D {
  ensureCanvasSize(canvas, map.width * BOARD_TILE_PIXEL_SIZE, map.height * BOARD_TILE_PIXEL_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCc2CellsToContext(
    ctx,
    map,
    Array.from({ length: map.tiles.length }, (_, index) => index),
    cache,
    { clearCells: false },
  );
  return ctx;
}
