// src/c2m/render/cc2Tileset.ts
import type { RgbaImage } from "./rgbaImage.js";
import { createImage, cropRect, blit } from "./rgbaImage.js";

export type CropSide = "TOP" | "RIGHT" | "BOTTOM" | "LEFT";
export type PasteLocation =
  | "TOP_LEFT"
  | "TOP_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_RIGHT"
  | "CENTER"
  | "VERY_RIGHT"
  | "VERY_BOTTOM";

const T = 32;

export class CC2Tileset {
  private readonly cache = new Map<string, RgbaImage>();

  public constructor(public readonly sheet: RgbaImage) {}

  public draw(x: number, y: number): RgbaImage {
    return this.cropCached(`draw:${x}:${y}`, x * T, y * T, (x + 1) * T, (y + 1) * T);
  }

  public drawSmall(x: number, y: number): RgbaImage {
    const s = T / 2;
    return this.cropCached(`drawSmall:${x}:${y}`, x * s, y * s, (x + 1) * s, (y + 1) * s);
  }

  public drawSide(x: number, y: number, side: CropSide): RgbaImage {
    const left = x * T;
    const top = y * T;
    const right = (x + 1) * T;
    const bottom = (y + 1) * T;
    const q = T / 4; // 8

    if (side === "TOP") return this.cropCached(`side:${x}:${y}:TOP`, left, top, right, top + q);
    if (side === "RIGHT")
      return this.cropCached(`side:${x}:${y}:RIGHT`, right - q, top, right, bottom);
    if (side === "BOTTOM")
      return this.cropCached(`side:${x}:${y}:BOTTOM`, left, bottom - q, right, bottom);
    return this.cropCached(`side:${x}:${y}:LEFT`, left, top, left + q, bottom);
  }

  public drawElectricSide(x: number, y: number, side: CropSide): RgbaImage {
    // Replicates your friend's "electric side" crop rectangles (intentional +1/-1 seams).
    const left = x * T;
    const top = y * T;
    const right = (x + 1) * T;
    const bottom = (y + 1) * T;
    const half = T / 2; // 16

    if (side === "TOP")
      return this.cropCached(`eside:${x}:${y}:TOP`, left, top, right, top + half - 1);
    if (side === "RIGHT")
      return this.cropCached(`eside:${x}:${y}:RIGHT`, left + half + 1, top, right, bottom);
    if (side === "BOTTOM")
      return this.cropCached(`eside:${x}:${y}:BOTTOM`, left, top + half + 1, right, bottom);
    return this.cropCached(`eside:${x}:${y}:LEFT`, left, top, left + half - 1, bottom);
  }

  public drawCounter(x: number, y: number): RgbaImage {
    // 3/4 width crop (used for counter overlay)
    const left = Math.floor((3 * x * T) / 4);
    const right = Math.floor((3 * (x + 1) * T) / 4);
    const top = y * T;
    const bottom = (y + 1) * T;
    return this.cropCached(`counter:${x}:${y}`, left, top, right, bottom);
  }

  public drawEmpty(): RgbaImage {
    return createImage(T, T, [0, 0, 0, 0]);
  }

  public merge(top: RgbaImage, bottom: RgbaImage, loc: PasteLocation = "TOP_LEFT"): RgbaImage {
    const out = this.drawEmpty();
    blit(out, bottom, 0, 0);

    const off = this.offsetFor(loc, top.width, top.height);
    blit(out, top, off.x, off.y);
    return out;
  }

  public mergeWithOffset(top: RgbaImage, bottom: RgbaImage, x: number, y: number): RgbaImage {
    const out = this.drawEmpty();
    blit(out, bottom, 0, 0);
    blit(out, top, x, y);
    return out;
  }

  private offsetFor(loc: PasteLocation, w: number, h: number): { x: number; y: number } {
    if (loc === "TOP_LEFT") return { x: 0, y: 0 };
    if (loc === "TOP_RIGHT") return { x: T / 2, y: 0 };
    if (loc === "BOTTOM_LEFT") return { x: 0, y: T / 2 };
    if (loc === "BOTTOM_RIGHT") return { x: T / 2, y: T / 2 };
    if (loc === "CENTER") return { x: T / 4, y: T / 4 };
    if (loc === "VERY_RIGHT") return { x: (3 * T) / 4, y: 0 };
    return { x: 0, y: (3 * T) / 4 }; // VERY_BOTTOM
  }

  private cropCached(
    key: string,
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): RgbaImage {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const img = cropRect(this.sheet, left, top, right, bottom);
    this.cache.set(key, img);
    return img;
  }
}
