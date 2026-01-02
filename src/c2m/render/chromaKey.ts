// src/c2m/render/chromaKey.ts
import type { RgbaImage } from "./rgbaImage.js";

export function applyChromaKeyInPlace(img: RgbaImage): void {
  // Pixel at (0,0) is the key.
  const k0 = 0;
  const kr = img.data[k0 + 0]!;
  const kg = img.data[k0 + 1]!;
  const kb = img.data[k0 + 2]!;
  const ka = img.data[k0 + 3]!;

  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    const r = img.data[o + 0]!;
    const g = img.data[o + 1]!;
    const b = img.data[o + 2]!;
    const a = img.data[o + 3]!;
    if (r === kr && g === kg && b === kb && a === ka) {
      img.data[o + 0] = 0;
      img.data[o + 1] = 0;
      img.data[o + 2] = 0;
      img.data[o + 3] = 0;
    }
  }
}
