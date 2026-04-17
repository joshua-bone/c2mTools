/// <reference lib="dom" />

export type TextBrushFontChoice = Readonly<{
  label: string;
  family: string;
  defaultSize: number;
  sizeChoices: ReadonlyArray<number>;
  sizeStepBase: number | null;
}>;

export type TextBrushAlign = "left" | "center" | "right";

export type RasterizedTextBrush = Readonly<{
  width: number;
  height: number;
  indices: ReadonlyArray<number>;
}>;

const TEXT_BRUSH_PADDING = 2;
const DEFAULT_ASCENT_RATIO = 0.8;
const DEFAULT_DESCENT_RATIO = 0.2;
const ALPHA_THRESHOLD = 56;
const GLYPH_GAP = 1;
const LINE_GAP = 1;
const SCALE_STEPS = Object.freeze([1, 2, 3, 4] as const);
const GENERIC_TEXT_BRUSH_SIZES = Object.freeze([6, 8, 10, 12, 16, 24, 32, 48] as const);
const PIXEL_FONT_BLOCK_THRESHOLD = 48;

function buildScaledSizes(baseSize: number): ReadonlyArray<number> {
  return Object.freeze(SCALE_STEPS.map((scale) => baseSize * scale));
}

export const TEXT_BRUSH_FONT_CHOICES: ReadonlyArray<TextBrushFontChoice> = Object.freeze([
  {
    label: "Tiny5",
    family: '"Tiny5", monospace',
    defaultSize: 5,
    sizeChoices: buildScaledSizes(5),
    sizeStepBase: 5,
  },
  {
    label: "Micro 5",
    family: '"Micro 5", monospace',
    defaultSize: 5,
    sizeChoices: buildScaledSizes(5),
    sizeStepBase: 5,
  },
  {
    label: "Silkscreen",
    family: '"Silkscreen", sans-serif',
    defaultSize: 8,
    sizeChoices: buildScaledSizes(8),
    sizeStepBase: 8,
  },
  {
    label: "Press Start 2P",
    family: '"Press Start 2P", monospace',
    defaultSize: 8,
    sizeChoices: buildScaledSizes(8),
    sizeStepBase: 8,
  },
  {
    label: "Wingdings",
    family: '"Wingdings", "Segoe UI Symbol", sans-serif',
    defaultSize: 12,
    sizeChoices: GENERIC_TEXT_BRUSH_SIZES,
    sizeStepBase: null,
  },
  {
    label: "Wingdings 2",
    family: '"Wingdings 2", "Segoe UI Symbol", sans-serif',
    defaultSize: 12,
    sizeChoices: GENERIC_TEXT_BRUSH_SIZES,
    sizeStepBase: null,
  },
  {
    label: "Wingdings 3",
    family: '"Wingdings 3", "Segoe UI Symbol", sans-serif',
    defaultSize: 12,
    sizeChoices: GENERIC_TEXT_BRUSH_SIZES,
    sizeStepBase: null,
  },
  {
    label: "Webdings",
    family: '"Webdings", "Segoe UI Symbol", sans-serif',
    defaultSize: 12,
    sizeChoices: GENERIC_TEXT_BRUSH_SIZES,
    sizeStepBase: null,
  },
  {
    label: "System Sans",
    family: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
    defaultSize: 12,
    sizeChoices: GENERIC_TEXT_BRUSH_SIZES,
    sizeStepBase: null,
  },
  {
    label: "System Mono",
    family: '"SFMono-Regular", "Menlo", "Monaco", "Courier New", monospace',
    defaultSize: 12,
    sizeChoices: GENERIC_TEXT_BRUSH_SIZES,
    sizeStepBase: null,
  },
]);

export const TEXT_BRUSH_ALIGN_CHOICES: ReadonlyArray<
  Readonly<{
    value: TextBrushAlign;
    label: string;
  }>
> = Object.freeze([
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
]);

export const TEXT_BRUSH_SIZE_CHOICES: ReadonlyArray<number> =
  TEXT_BRUSH_FONT_CHOICES[0]!.sizeChoices;

export const DEFAULT_TEXT_BRUSH_TEXT = "TEXT";
export const DEFAULT_TEXT_BRUSH_FONT_FAMILY = TEXT_BRUSH_FONT_CHOICES[0]!.family;
export const DEFAULT_TEXT_BRUSH_FONT_SIZE = TEXT_BRUSH_FONT_CHOICES[0]!.defaultSize;
export const DEFAULT_TEXT_BRUSH_ALIGN: TextBrushAlign = "left";

export function getTextBrushFontChoice(fontFamily: string): TextBrushFontChoice {
  return (
    TEXT_BRUSH_FONT_CHOICES.find((choice) => choice.family === fontFamily) ??
    TEXT_BRUSH_FONT_CHOICES[0]!
  );
}

export function getTextBrushSizeChoices(fontFamily: string): ReadonlyArray<number> {
  return getTextBrushFontChoice(fontFamily).sizeChoices;
}

export function normalizeTextBrushFontSize(fontFamily: string, fontSize: number): number {
  const sizeChoices = getTextBrushSizeChoices(fontFamily);
  if (sizeChoices.includes(fontSize)) return fontSize;
  return sizeChoices.reduce((closest, size) =>
    Math.abs(size - fontSize) < Math.abs(closest - fontSize) ? size : closest,
  );
}

export function formatTextBrushFontSizeLabel(fontFamily: string, fontSize: number): string {
  const choice = getTextBrushFontChoice(fontFamily);
  if (choice.sizeStepBase && fontSize % choice.sizeStepBase === 0) {
    return `${fontSize}px (${fontSize / choice.sizeStepBase}x)`;
  }
  return `${fontSize}px`;
}

export function getTextBrushPreviewFontSize(fontFamily: string, fontSize: number): number {
  const choice = getTextBrushFontChoice(fontFamily);
  if (choice.sizeStepBase) {
    return Math.min(fontSize * 4, 96);
  }
  return Math.min(Math.max(fontSize * 2.25, 14), 40);
}

export async function loadTextBrushFont(
  fontFamily: string,
  fontSize: number,
  text: string,
): Promise<void> {
  if (typeof document === "undefined" || typeof document.fonts?.load !== "function") return;
  const sample = text.trim().length > 0 ? text : DEFAULT_TEXT_BRUSH_TEXT;
  await document.fonts.load(`${fontSize}px ${fontFamily}`, sample);
}

type MeasuredGlyph = Readonly<{
  char: string;
  advance: number;
}>;

type MeasuredLine = Readonly<{
  glyphs: ReadonlyArray<MeasuredGlyph>;
  width: number;
}>;

type AlphaMask = Readonly<{
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}>;

type TextRasterCropMode = "content" | "full";

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
  const kerningContext = ctx as CanvasRenderingContext2D & { fontKerning?: string };
  if (typeof kerningContext.fontKerning !== "undefined") {
    kerningContext.fontKerning = "none";
  }
}

function measureGlyphAdvance(
  ctx: CanvasRenderingContext2D,
  char: string,
  fontSize: number,
): number {
  const metrics = ctx.measureText(char === "" ? " " : char);
  const visualWidth = Math.ceil(
    Math.max(
      metrics.width || 0,
      (metrics.actualBoundingBoxRight || 0) - Math.min(metrics.actualBoundingBoxLeft || 0, 0),
      char === " " ? fontSize * 0.5 : 0,
      1,
    ),
  );
  return visualWidth;
}

function measureLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  fontSize: number,
  glyphGap: number,
): MeasuredLine {
  const glyphs = Array.from(line).map((char) => ({
    char,
    advance: measureGlyphAdvance(ctx, char, fontSize),
  }));

  if (glyphs.length === 0) {
    return {
      glyphs,
      width: 0,
    };
  }

  const width =
    glyphs.reduce((total, glyph) => total + glyph.advance, 0) + glyphGap * (glyphs.length - 1);

  return {
    glyphs,
    width,
  };
}

function renderTextAlphaMask(
  text: string,
  fontFamily: string,
  fontSize: number,
  align: TextBrushAlign,
  glyphGap: number,
  lineGap: number,
  padding: number,
): AlphaMask | null {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  if (normalizedText.trim().length === 0) return null;

  const lines = normalizedText.split("\n");
  const canvas = createScratchCanvas();
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  applyTextContextStyle(ctx, fontFamily, fontSize);
  const lineMetrics = lines.map((line) => ctx.measureText(line.length > 0 ? line : " "));
  const measuredLines = lines.map((line) => measureLine(ctx, line, fontSize, glyphGap));
  const maxLeft = Math.max(
    0,
    ...lineMetrics.map((metrics) => Math.ceil(metrics.actualBoundingBoxLeft || 0)),
  );
  const maxRight = Math.max(1, ...measuredLines.map((line) => line.width));
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
  const lineHeight = Math.max(fontSize + lineGap, ascent + descent + lineGap);
  const canvasWidth = Math.max(1, maxLeft + maxRight + padding * 2);
  const contentHeight = Math.max(1, lineHeight * lines.length - lineGap);
  const canvasHeight = Math.max(1, contentHeight + padding * 2);

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const drawCtx = canvas.getContext("2d");
  if (!drawCtx) return null;

  applyTextContextStyle(drawCtx, fontFamily, fontSize);
  drawCtx.clearRect(0, 0, canvasWidth, canvasHeight);

  const baselineX = padding + maxLeft;
  const baselineY = padding + ascent;
  measuredLines.forEach((line, index) => {
    const alignedOffset =
      align === "center"
        ? Math.floor((maxRight - line.width) / 2)
        : align === "right"
          ? maxRight - line.width
          : 0;
    let cursorX = baselineX + Math.max(0, alignedOffset);
    for (const glyph of line.glyphs) {
      if (glyph.char !== " ") {
        drawCtx.fillText(glyph.char, cursorX, baselineY + index * lineHeight);
      }
      cursorX += glyph.advance + glyphGap;
    }
  });

  const imageData = drawCtx.getImageData(0, 0, canvasWidth, canvasHeight);
  const alpha = new Uint8ClampedArray(canvasWidth * canvasHeight);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = imageData.data[index * 4 + 3] ?? 0;
  }

  return {
    width: canvasWidth,
    height: canvasHeight,
    alpha,
  };
}

function cropAlphaMask(
  alphaMask: AlphaMask,
  threshold: number,
  preserveFullHeight = false,
): RasterizedTextBrush | null {
  const indices: number[] = [];
  let minX = alphaMask.width;
  let minY = alphaMask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < alphaMask.height; y += 1) {
    for (let x = 0; x < alphaMask.width; x += 1) {
      const alpha = alphaMask.alpha[y * alphaMask.width + x] ?? 0;
      if (alpha < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      indices.push(y * alphaMask.width + x);
    }
  }

  if (indices.length === 0 || maxX < minX || maxY < minY) return null;

  const width = maxX - minX + 1;
  const cropMinY = preserveFullHeight ? 0 : minY;
  const cropMaxY = preserveFullHeight ? alphaMask.height - 1 : maxY;
  const height = cropMaxY - cropMinY + 1;
  const croppedIndices = indices.map((index) => {
    const x = index % alphaMask.width;
    const y = Math.floor(index / alphaMask.width);
    return (y - cropMinY) * width + (x - minX);
  });

  return {
    width,
    height,
    indices: croppedIndices,
  };
}

function cropAlphaMaskToBounds(
  alphaMask: AlphaMask,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): AlphaMask {
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      alpha[(y - minY) * width + (x - minX)] = alphaMask.alpha[y * alphaMask.width + x] ?? 0;
    }
  }
  return { width, height, alpha };
}

function alphaMaskToRaster(
  alphaMask: AlphaMask,
  threshold: number,
  cropMode: TextRasterCropMode,
  preserveFullHeight = false,
): RasterizedTextBrush | null {
  if (cropMode === "content") {
    return cropAlphaMask(alphaMask, threshold, preserveFullHeight);
  }

  const indices: number[] = [];
  for (let y = 0; y < alphaMask.height; y += 1) {
    for (let x = 0; x < alphaMask.width; x += 1) {
      const alpha = alphaMask.alpha[y * alphaMask.width + x] ?? 0;
      if (alpha >= threshold) {
        indices.push(y * alphaMask.width + x);
      }
    }
  }

  return {
    width: alphaMask.width,
    height: alphaMask.height,
    indices,
  };
}

export function reducePixelFontBlockAlpha(
  block: ReadonlyArray<number>,
  threshold = PIXEL_FONT_BLOCK_THRESHOLD,
): number {
  if (block.length === 0) return 0;
  const average = block.reduce((total, value) => total + value, 0) / block.length;
  return average >= threshold ? 255 : 0;
}

function downsampleAlphaMask(alphaMask: AlphaMask, factor: number): AlphaMask {
  const width = Math.max(1, Math.ceil(alphaMask.width / factor));
  const height = Math.max(1, Math.ceil(alphaMask.height / factor));
  const alpha = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const block: number[] = [];
      for (let dy = 0; dy < factor; dy += 1) {
        const sourceY = y * factor + dy;
        if (sourceY >= alphaMask.height) break;
        for (let dx = 0; dx < factor; dx += 1) {
          const sourceX = x * factor + dx;
          if (sourceX >= alphaMask.width) break;
          block.push(alphaMask.alpha[sourceY * alphaMask.width + sourceX] ?? 0);
        }
      }
      alpha[y * width + x] = reducePixelFontBlockAlpha(block);
    }
  }

  return { width, height, alpha };
}

export function scaleRasterizedTextBrush(
  raster: RasterizedTextBrush,
  factor: number,
): RasterizedTextBrush {
  if (factor <= 1) return raster;
  const width = raster.width * factor;
  const height = raster.height * factor;
  const indices: number[] = [];
  for (const index of raster.indices) {
    const sourceX = index % raster.width;
    const sourceY = Math.floor(index / raster.width);
    for (let dy = 0; dy < factor; dy += 1) {
      for (let dx = 0; dx < factor; dx += 1) {
        indices.push((sourceY * factor + dy) * width + (sourceX * factor + dx));
      }
    }
  }
  return { width, height, indices };
}

function findAlphaBounds(
  alphaMask: AlphaMask,
  threshold: number,
): [number, number, number, number] | null {
  let minX = alphaMask.width;
  let minY = alphaMask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < alphaMask.height; y += 1) {
    for (let x = 0; x < alphaMask.width; x += 1) {
      const alpha = alphaMask.alpha[y * alphaMask.width + x] ?? 0;
      if (alpha < threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  return maxX >= minX && maxY >= minY ? [minX, minY, maxX, maxY] : null;
}

function cropAlphaMaskToAlignedBounds(
  alphaMask: AlphaMask,
  threshold: number,
  factor: number,
): AlphaMask {
  const bounds = findAlphaBounds(alphaMask, threshold);
  if (!bounds) return alphaMask;
  const [minX, minY, maxX, maxY] = bounds;
  const alignedWidth = Math.ceil((maxX - minX + 1) / factor) * factor;
  const alignedHeight = Math.ceil((maxY - minY + 1) / factor) * factor;
  const alignedMaxX = Math.min(alphaMask.width - 1, minX + alignedWidth - 1);
  const alignedMaxY = Math.min(alphaMask.height - 1, minY + alignedHeight - 1);
  return cropAlphaMaskToBounds(alphaMask, minX, minY, alignedMaxX, alignedMaxY);
}

function rasterizePixelFontGlyph(
  char: string,
  fontFamily: string,
  fontSize: number,
): RasterizedTextBrush {
  const previewFontSize = getTextBrushPreviewFontSize(fontFamily, fontSize);
  const previewScale = Math.max(1, Math.round(previewFontSize / fontSize));
  const previewMask = renderTextAlphaMask(
    char === " " ? " " : char,
    fontFamily,
    previewFontSize,
    "left",
    0,
    0,
    0,
  );
  if (!previewMask) {
    return {
      width: Math.max(1, fontSize),
      height: Math.max(1, fontSize),
      indices: [],
    };
  }

  const alignedMask =
    char === " "
      ? previewMask
      : cropAlphaMaskToAlignedBounds(previewMask, ALPHA_THRESHOLD, previewScale);
  const reducedMask = downsampleAlphaMask(alignedMask, previewScale);
  const raster = alphaMaskToRaster(reducedMask, ALPHA_THRESHOLD, "full");

  return (
    raster ?? {
      width: reducedMask.width,
      height: reducedMask.height,
      indices: [],
    }
  );
}

function composeRasterizedTextBrush(
  lines: ReadonlyArray<ReadonlyArray<RasterizedTextBrush>>,
  align: TextBrushAlign,
  glyphGap: number,
  lineGap: number,
): RasterizedTextBrush | null {
  if (lines.length === 0) return null;

  const lineWidths = lines.map((line) =>
    line.reduce((total, glyph, index) => total + glyph.width + (index > 0 ? glyphGap : 0), 0),
  );
  const lineHeights = lines.map((line) =>
    Math.max(1, ...line.map((glyph) => glyph.height), line.length === 0 ? 1 : 0),
  );
  const width = Math.max(1, ...lineWidths);
  const height = Math.max(
    1,
    lineHeights.reduce((total, value) => total + value, 0) + lineGap * (lines.length - 1),
  );
  const indices: number[] = [];

  let cursorY = 0;
  lines.forEach((line, lineIndex) => {
    const lineWidth = lineWidths[lineIndex] ?? 0;
    const xOffset =
      align === "center"
        ? Math.floor((width - lineWidth) / 2)
        : align === "right"
          ? width - lineWidth
          : 0;
    let cursorX = xOffset;
    line.forEach((glyph, glyphIndex) => {
      if (glyphIndex > 0) {
        cursorX += glyphGap;
      }
      for (const index of glyph.indices) {
        const x = cursorX + (index % glyph.width);
        const y = cursorY + Math.floor(index / glyph.width);
        indices.push(y * width + x);
      }
      cursorX += glyph.width;
    });
    cursorY += (lineHeights[lineIndex] ?? 1) + lineGap;
  });

  return { width, height, indices };
}

function rasterizePixelFontText(
  text: string,
  fontFamily: string,
  fontSize: number,
  align: TextBrushAlign,
): RasterizedTextBrush | null {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  if (normalizedText.trim().length === 0) return null;
  const lines = normalizedText
    .split("\n")
    .map((line) =>
      Array.from(line).map((char) => rasterizePixelFontGlyph(char, fontFamily, fontSize)),
    );
  return composeRasterizedTextBrush(lines, align, GLYPH_GAP, LINE_GAP);
}

export function rasterizeTextBrushPreviewModel(
  text: string,
  fontFamily: string,
  fontSize: number,
  align: TextBrushAlign,
): RasterizedTextBrush | null {
  const brush = rasterizeTextBrush(text, fontFamily, fontSize, align);
  if (!brush) return null;
  const choice = getTextBrushFontChoice(fontFamily);
  if (!choice.sizeStepBase) return brush;
  const previewFontSize = getTextBrushPreviewFontSize(fontFamily, fontSize);
  const previewScale = Math.max(1, Math.round(previewFontSize / fontSize));
  return scaleRasterizedTextBrush(brush, previewScale);
}

export function rasterizeTextBrush(
  text: string,
  fontFamily: string,
  fontSize: number,
  align: TextBrushAlign,
): RasterizedTextBrush | null {
  const choice = getTextBrushFontChoice(fontFamily);
  if (choice.sizeStepBase) {
    return rasterizePixelFontText(text, fontFamily, fontSize, align);
  }

  const alphaMask = renderTextAlphaMask(
    text,
    fontFamily,
    fontSize,
    align,
    GLYPH_GAP,
    LINE_GAP,
    TEXT_BRUSH_PADDING,
  );
  if (!alphaMask) return null;
  return cropAlphaMask(alphaMask, ALPHA_THRESHOLD);
}
