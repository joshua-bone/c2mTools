export type TextBrushFontChoice = Readonly<{
  label: string;
  family: string;
}>;

export type RasterizedTextBrush = Readonly<{
  width: number;
  height: number;
  indices: ReadonlyArray<number>;
}>;

const TEXT_BRUSH_PADDING = 2;
const DEFAULT_ASCENT_RATIO = 0.8;
const DEFAULT_DESCENT_RATIO = 0.2;
const ALPHA_THRESHOLD = 72;

export const TEXT_BRUSH_FONT_CHOICES: ReadonlyArray<TextBrushFontChoice> = Object.freeze([
  { label: "Small Fonts", family: '"Small Fonts", "MS Sans Serif", sans-serif' },
  { label: "Wingdings", family: '"Wingdings", "Segoe UI Symbol", sans-serif' },
  { label: "Wingdings 2", family: '"Wingdings 2", "Segoe UI Symbol", sans-serif' },
  { label: "Wingdings 3", family: '"Wingdings 3", "Segoe UI Symbol", sans-serif' },
  { label: "Webdings", family: '"Webdings", "Segoe UI Symbol", sans-serif' },
  { label: "Tahoma", family: '"Tahoma", "Segoe UI", sans-serif' },
  { label: "Verdana", family: '"Verdana", "Segoe UI", sans-serif' },
  { label: "Arial Narrow", family: '"Arial Narrow", "Arial", sans-serif' },
  { label: "Courier New", family: '"Courier New", monospace' },
]);

export const TEXT_BRUSH_SIZE_CHOICES: ReadonlyArray<number> = Object.freeze([
  4, 5, 6, 7, 8, 9, 10, 12, 14, 16,
]);

export const DEFAULT_TEXT_BRUSH_TEXT = "TEXT";
export const DEFAULT_TEXT_BRUSH_FONT_FAMILY = TEXT_BRUSH_FONT_CHOICES[0]!.family;
export const DEFAULT_TEXT_BRUSH_FONT_SIZE = 6;

function createScratchCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  return document.createElement("canvas");
}

function applyTextContextStyle(
  ctx: CanvasRenderingContext2D,
  fontFamily: string,
  fontSize: number,
): void {
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#111";
  ctx.imageSmoothingEnabled = false;
}

export function rasterizeTextBrush(
  text: string,
  fontFamily: string,
  fontSize: number,
): RasterizedTextBrush | null {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  if (normalizedText.trim().length === 0) return null;

  const lines = normalizedText.split("\n");
  const canvas = createScratchCanvas();
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  applyTextContextStyle(ctx, fontFamily, fontSize);
  const lineMetrics = lines.map((line) => ctx.measureText(line.length > 0 ? line : " "));
  const maxLeft = Math.max(
    0,
    ...lineMetrics.map((metrics) => Math.ceil(metrics.actualBoundingBoxLeft || 0)),
  );
  const maxRight = Math.max(
    1,
    ...lineMetrics.map((metrics) =>
      Math.ceil(Math.max(metrics.actualBoundingBoxRight || 0, metrics.width || 0)),
    ),
  );
  const ascent = Math.max(
    1,
    ...lineMetrics.map((metrics) =>
      Math.ceil(metrics.actualBoundingBoxAscent || fontSize * DEFAULT_ASCENT_RATIO),
    ),
  );
  const descent = Math.max(
    1,
    ...lineMetrics.map((metrics) =>
      Math.ceil(metrics.actualBoundingBoxDescent || fontSize * DEFAULT_DESCENT_RATIO),
    ),
  );
  const lineHeight = Math.max(fontSize + 1, ascent + descent + 1);
  const canvasWidth = Math.max(1, maxLeft + maxRight + TEXT_BRUSH_PADDING * 2);
  const canvasHeight = Math.max(1, lineHeight * lines.length + TEXT_BRUSH_PADDING * 2);

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const drawCtx = canvas.getContext("2d");
  if (!drawCtx) return null;

  applyTextContextStyle(drawCtx, fontFamily, fontSize);
  drawCtx.clearRect(0, 0, canvasWidth, canvasHeight);

  const baselineX = TEXT_BRUSH_PADDING + maxLeft;
  const baselineY = TEXT_BRUSH_PADDING + ascent;
  lines.forEach((line, index) => {
    if (line.length === 0) return;
    drawCtx.fillText(line, baselineX, baselineY + index * lineHeight);
  });

  const imageData = drawCtx.getImageData(0, 0, canvasWidth, canvasHeight);
  const indices: number[] = [];
  let minX = canvasWidth;
  let minY = canvasHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvasHeight; y += 1) {
    for (let x = 0; x < canvasWidth; x += 1) {
      const alpha = imageData.data[(y * canvasWidth + x) * 4 + 3] ?? 0;
      if (alpha < ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      indices.push(y * canvasWidth + x);
    }
  }

  if (indices.length === 0 || maxX < minX || maxY < minY) return null;

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const croppedIndices = indices.map((index) => {
    const x = index % canvasWidth;
    const y = Math.floor(index / canvasWidth);
    return (y - minY) * width + (x - minX);
  });

  return {
    width,
    height,
    indices: croppedIndices,
  };
}
