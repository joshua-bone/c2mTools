import { useEffect, useRef } from "react";

import type { TileSpecJson } from "../../src/c2m/mapCodec.js";
import type { CC2Tileset } from "../../src/c2m/render/cc2Tileset.js";
import { BOARD_TILE_PIXEL_SIZE, ensureCanvasSize } from "./boardCanvasPresentation";
import { getSharedCc2CanvasCellCache } from "./cc2CanvasCache";
import { createPreviewTileSpec } from "./editor/renderPreview";

type TilePreviewProps = Readonly<{
  tileset: CC2Tileset | null;
  tile: string | TileSpecJson;
  className?: string;
  pixelSize?: number;
}>;

export function TilePreview({ tileset, tile, className, pixelSize }: TilePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!tileset) {
      ensureCanvasSize(canvas, 1, 1);
      return;
    }

    ensureCanvasSize(canvas, BOARD_TILE_PIXEL_SIZE, BOARD_TILE_PIXEL_SIZE);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    getSharedCc2CanvasCellCache(tileset).drawCell(ctx, createPreviewTileSpec(tile), 0, 0);
  }, [tile, tileset]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={pixelSize ? { width: pixelSize, height: pixelSize } : undefined}
    />
  );
}
