import type { RgbaImage } from "../../src/c2m/render/rgbaImage.js";

export function drawRgbaImageToContext(
  ctx: CanvasRenderingContext2D,
  image: RgbaImage,
  dx = 0,
  dy = 0,
): void {
  const clamped = new Uint8ClampedArray(image.data);
  ctx.putImageData(new ImageData(clamped, image.width, image.height), dx, dy);
}
