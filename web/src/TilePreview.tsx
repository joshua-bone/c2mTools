import { useEffect, useRef } from "react";

import type { TileSpecJson } from "../../src/c2m/mapCodec.js";
import type { CC2Tileset } from "../../src/c2m/render/cc2Tileset.js";
import { BOARD_TILE_PIXEL_SIZE, ensureCanvasSize } from "./boardCanvasPresentation";
import { drawRgbaImageToContext } from "./canvasDrawing";
import {
  drawDirectionArrow,
  resolveMobDirectionArrow,
  resolvePaletteDirectionArrow,
} from "./directionArrows";
import { createPreviewTileSpec, renderTilePreview } from "./editor/renderPreview";

type TilePreviewProps = Readonly<{
  tileset: CC2Tileset | null;
  tile?: string | TileSpecJson;
  spriteSheetCell?: Readonly<{
    x: number;
    y: number;
  }>;
  className?: string;
  pixelSize?: number;
  directionArrowMode?: "map" | "palette";
}>;

export function TilePreview({
  tileset,
  tile,
  spriteSheetCell,
  className,
  pixelSize,
  directionArrowMode,
}: TilePreviewProps) {
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
    if (spriteSheetCell) {
      drawRgbaImageToContext(ctx, tileset.draw(spriteSheetCell.x, spriteSheetCell.y), 0, 0);
    } else if (tile !== undefined) {
      const previewTile = createPreviewTileSpec(tile);
      drawRgbaImageToContext(ctx, renderTilePreview(tileset, previewTile), 0, 0);

      const direction =
        directionArrowMode === "palette"
          ? resolvePaletteDirectionArrow(previewTile)
          : directionArrowMode === "map"
            ? resolveMobDirectionArrow(previewTile)
            : null;
      if (direction) {
        drawDirectionArrow(ctx, direction, BOARD_TILE_PIXEL_SIZE);
      }
    }
  }, [directionArrowMode, spriteSheetCell, tile, tileset]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={pixelSize ? { width: pixelSize, height: pixelSize } : undefined}
    />
  );
}
