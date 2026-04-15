import { canonicalizeTileSpec } from "../../src/c2m/cellStack.js";
import type { TileSpecJson } from "../../src/c2m/mapCodec.js";
import { CC2RendererCore } from "../../src/c2m/render/cc2RendererCore.js";
import type { CC2Tileset } from "../../src/c2m/render/cc2Tileset.js";
import { BOARD_TILE_PIXEL_SIZE } from "./boardCanvasPresentation.js";
import { drawRgbaImageToContext } from "./canvasDrawing.js";
import { drawDirectionArrow, resolveMobDirectionArrow } from "./directionArrows.js";

export type CanvasAtlasSource = Readonly<{
  canvas: HTMLCanvasElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}>;

export type Cc2CanvasCellCache = Readonly<{
  tileSize: number;
  getCell: (tile: TileSpecJson) => CanvasAtlasSource;
  drawCell: (ctx: CanvasRenderingContext2D, tile: TileSpecJson, dx?: number, dy?: number) => void;
  size: () => number;
}>;

class CanvasAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly tileSize: number;
  readonly columns: number;
  private ctx: CanvasRenderingContext2D;
  private slotCount = 0;

  constructor(tileSize: number, columns = 16) {
    this.tileSize = tileSize;
    this.columns = columns;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.tileSize * this.columns;
    this.canvas.height = this.tileSize;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
  }

  allocate(
    drawer: (ctx: CanvasRenderingContext2D, dx: number, dy: number) => void,
  ): CanvasAtlasSource {
    const slotIndex = this.slotCount;
    this.slotCount += 1;

    const row = Math.floor(slotIndex / this.columns);
    const nextHeight = (row + 1) * this.tileSize;
    if (nextHeight > this.canvas.height) {
      const previous = document.createElement("canvas");
      previous.width = this.canvas.width;
      previous.height = this.canvas.height;
      const previousCtx = previous.getContext("2d");
      if (!previousCtx) throw new Error("Canvas 2D context unavailable");
      previousCtx.drawImage(this.canvas, 0, 0);

      this.canvas.height = nextHeight;
      const nextCtx = this.canvas.getContext("2d");
      if (!nextCtx) throw new Error("Canvas 2D context unavailable");
      this.ctx = nextCtx;
      this.ctx.drawImage(previous, 0, 0);
    }

    const column = slotIndex % this.columns;
    const dx = column * this.tileSize;
    const dy = row * this.tileSize;
    drawer(this.ctx, dx, dy);

    return {
      canvas: this.canvas,
      sx: dx,
      sy: dy,
      sw: this.tileSize,
      sh: this.tileSize,
    };
  }
}

const sharedCacheByTileset = new WeakMap<CC2Tileset, Cc2CanvasCellCache>();

function cellCacheKey(tile: TileSpecJson): string {
  return JSON.stringify(canonicalizeTileSpec(tile));
}

export function createCc2CanvasCellCache(tileset: CC2Tileset): Cc2CanvasCellCache {
  const atlas = new CanvasAtlas(BOARD_TILE_PIXEL_SIZE);
  const renderer = new CC2RendererCore(tileset);
  const cells = new Map<string, CanvasAtlasSource>();

  const drawSource = (
    ctx: CanvasRenderingContext2D,
    source: CanvasAtlasSource,
    dx = 0,
    dy = 0,
  ): void => {
    ctx.drawImage(
      source.canvas,
      source.sx,
      source.sy,
      source.sw,
      source.sh,
      dx,
      dy,
      source.sw,
      source.sh,
    );
  };

  const getCell = (tile: TileSpecJson): CanvasAtlasSource => {
    const key = cellCacheKey(tile);
    const hit = cells.get(key);
    if (hit) return hit;

    const image = renderer.renderMap({
      width: 1,
      height: 1,
      tiles: [canonicalizeTileSpec(tile)],
    });
    const direction = resolveMobDirectionArrow(tile);
    const source = atlas.allocate((ctx, dx, dy) => {
      drawRgbaImageToContext(ctx, image, dx, dy);
      if (direction) {
        drawDirectionArrow(ctx, direction, BOARD_TILE_PIXEL_SIZE, dx, dy);
      }
    });
    cells.set(key, source);
    return source;
  };

  return {
    tileSize: BOARD_TILE_PIXEL_SIZE,
    getCell,
    drawCell(ctx, tile, dx = 0, dy = 0) {
      drawSource(ctx, getCell(tile), dx, dy);
    },
    size() {
      return cells.size;
    },
  };
}

export function getSharedCc2CanvasCellCache(tileset: CC2Tileset): Cc2CanvasCellCache {
  const hit = sharedCacheByTileset.get(tileset);
  if (hit) return hit;

  const created = createCc2CanvasCellCache(tileset);
  sharedCacheByTileset.set(tileset, created);
  return created;
}
