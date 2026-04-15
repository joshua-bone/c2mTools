import type { C2mJsonV1 } from "../../src/c2m/c2mJsonV1.js";
import type { CC2Tileset } from "../../src/c2m/render/cc2Tileset.js";
import { getSharedCc2CanvasCellCache } from "./cc2CanvasCache.js";
import { drawCc2MapToCanvas } from "./canvasMapRenderer.js";
import { resolveRecentLevelThumbnailTileSize } from "./recentLevelSizing.js";

const THUMBNAIL_MIME_TYPE = "image/png";
const SOURCE_TILE_PIXEL_SIZE = 32;

export function renderRecentLevelThumbnail(
  doc: C2mJsonV1,
  tileset: CC2Tileset | null,
): string | null {
  if (typeof document === "undefined" || !doc.map || !tileset) return null;

  const sourceCanvas = document.createElement("canvas");
  drawCc2MapToCanvas(sourceCanvas, doc.map, getSharedCc2CanvasCellCache(tileset));

  const thumbnailTileSize = resolveRecentLevelThumbnailTileSize(doc.map);
  const scale = thumbnailTileSize / SOURCE_TILE_PIXEL_SIZE;
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  thumbnailCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

  const ctx = thumbnailCanvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);

  return thumbnailCanvas.toDataURL(THUMBNAIL_MIME_TYPE);
}
