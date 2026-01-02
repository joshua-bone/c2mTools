// src/c2m/render/png.ts
import { readFile } from "node:fs/promises";
import * as pngjs from "pngjs";
import type { RgbaImage } from "./rgbaImage.js";
import { applyChromaKeyInPlace } from "./chromaKey.js";

const { PNG } = pngjs;

export async function loadPngRgba(path: string): Promise<RgbaImage> {
  const buf = await readFile(path);
  const png = PNG.sync.read(buf);
  const data = new Uint8Array(png.data); // copy view
  return { width: png.width, height: png.height, data };
}

export function writePngRgba(img: RgbaImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png);
}

// Re-export for Node callers (browser should import from chromaKey.ts)
export { applyChromaKeyInPlace };
