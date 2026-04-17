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

export function rasterizeTextBrush(
  text: string,
  fontFamily: string,
  fontSize: number,
  align: TextBrushAlign,
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
  const measuredLines = lines.map((line) => measureLine(ctx, line, fontSize, GLYPH_GAP));
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
  const lineHeight = Math.max(fontSize + LINE_GAP, ascent + descent + LINE_GAP);
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
      cursorX += glyph.advance + GLYPH_GAP;
    }
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
