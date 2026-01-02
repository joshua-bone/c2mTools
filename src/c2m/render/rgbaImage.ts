// src/c2m/render/rgbaImage.ts
export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array; // length = width*height*4 (RGBA)
};

export function createImage(
  width: number,
  height: number,
  fill: readonly [number, number, number, number] = [0, 0, 0, 0],
): RgbaImage {
  const [r, g, b, a] = fill;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o + 0] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = a;
  }
  return { width, height, data };
}

export function cloneImage(src: RgbaImage): RgbaImage {
  return { width: src.width, height: src.height, data: new Uint8Array(src.data) };
}

export function cropRect(
  src: RgbaImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): RgbaImage {
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) throw new Error(`Invalid cropRect w=${w} h=${h}`);
  if (left < 0 || top < 0 || right > src.width || bottom > src.height) {
    throw new Error(
      `cropRect out of bounds: (${left},${top})-(${right},${bottom}) vs ${src.width}x${src.height}`,
    );
  }

  const out = createImage(w, h, [0, 0, 0, 0]);
  for (let y = 0; y < h; y++) {
    const srcRow = (top + y) * src.width * 4;
    const dstRow = y * w * 4;
    const srcStart = srcRow + left * 4;
    const srcEnd = srcStart + w * 4;
    out.data.set(src.data.subarray(srcStart, srcEnd), dstRow);
  }
  return out;
}

export function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number): void {
  // Alpha composite src over dst at (dx,dy)
  const x0 = Math.max(0, dx);
  const y0 = Math.max(0, dy);
  const x1 = Math.min(dst.width, dx + src.width);
  const y1 = Math.min(dst.height, dy + src.height);

  if (x1 <= x0 || y1 <= y0) return;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const sx = x - dx;
      const sy = y - dy;

      const si = (sy * src.width + sx) * 4;
      const di = (y * dst.width + x) * 4;

      const sr = src.data[si + 0]!;
      const sg = src.data[si + 1]!;
      const sb = src.data[si + 2]!;
      const sa = src.data[si + 3]! / 255;

      if (sa <= 0) continue;

      const dr = dst.data[di + 0]!;
      const dg = dst.data[di + 1]!;
      const db = dst.data[di + 2]!;
      const da = dst.data[di + 3]! / 255;

      const outA = sa + da * (1 - sa);
      if (outA <= 0) {
        dst.data[di + 0] = 0;
        dst.data[di + 1] = 0;
        dst.data[di + 2] = 0;
        dst.data[di + 3] = 0;
        continue;
      }

      const outR = (sr * sa + dr * da * (1 - sa)) / outA;
      const outG = (sg * sa + dg * da * (1 - sa)) / outA;
      const outB = (sb * sa + db * da * (1 - sa)) / outA;

      dst.data[di + 0] = Math.max(0, Math.min(255, Math.round(outR)));
      dst.data[di + 1] = Math.max(0, Math.min(255, Math.round(outG)));
      dst.data[di + 2] = Math.max(0, Math.min(255, Math.round(outB)));
      dst.data[di + 3] = Math.max(0, Math.min(255, Math.round(outA * 255)));
    }
  }
}
