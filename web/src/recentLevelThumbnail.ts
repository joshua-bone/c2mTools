import type { C2mJsonV1 } from "../../src/c2m/c2mJsonV1.js";
import type { CC2Tileset } from "../../src/c2m/render/cc2Tileset.js";
import { getSharedCc2CanvasCellCache } from "./cc2CanvasCache.js";
import { drawCc2MapToCanvas } from "./canvasMapRenderer.js";

const MAX_THUMBNAIL_DIMENSION = 208;
const THUMBNAIL_MIME_TYPE = "image/png";

export function renderRecentLevelThumbnail(
  doc: C2mJsonV1,
  tileset: CC2Tileset | null,
): string | null {
  if (typeof document === "undefined" || !doc.map || !tileset) return null;

  const sourceCanvas = document.createElement("canvas");
  drawCc2MapToCanvas(sourceCanvas, doc.map, getSharedCc2CanvasCellCache(tileset));

  const scale = Math.min(
    1,
    MAX_THUMBNAIL_DIMENSION / Math.max(sourceCanvas.width, sourceCanvas.height),
  );
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  thumbnailCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

  const ctx = thumbnailCanvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);

  return thumbnailCanvas.toDataURL(THUMBNAIL_MIME_TYPE);
}
