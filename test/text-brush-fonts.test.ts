import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_TEXT_BRUSH_FONT_FAMILY,
  DEFAULT_TEXT_BRUSH_FONT_SIZE,
  TEXT_BRUSH_FONT_CHOICES,
  formatTextBrushFontSizeLabel,
  getTextBrushPreviewFontSize,
  getTextBrushSizeChoices,
  normalizeTextBrushFontSize,
  rasterizeTextBrush,
  rasterizeTextBrushPreviewModel,
  reducePixelFontBlockAlpha,
} from "../web/src/editor/textBrush.js";

const PREVIEW_SCALE = 4;
const GLYPH_X_OFFSET = 1;
const GLYPH_Y_OFFSET = 2;
const NATIVE_FONT_HEIGHT = 5;

const GLYPHS = {
  T: ["####", ".#..", ".#..", ".#..", ".#.."],
  E: ["###", "#..", "###", "#..", "###"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  " ": ["..", "..", "..", "..", ".."],
} as const;

type FakeImageData = { data: Uint8ClampedArray };

function glyphWidth(char: string): number {
  const rows = GLYPHS[char as keyof typeof GLYPHS] ?? GLYPHS[" "];
  return rows[0]?.length ?? 1;
}

function expandGlyph(char: string, scale: number): string[] {
  const rows = GLYPHS[char as keyof typeof GLYPHS] ?? GLYPHS[" "];
  return rows.flatMap((row) =>
    Array.from({ length: scale }, () =>
      row.replace(/./g, (cell) => (cell === "#" ? "#".repeat(scale) : ".".repeat(scale))),
    ),
  );
}

function composeRows(parts: ReadonlyArray<ReadonlyArray<string>>, gap: number): string[] {
  const height = Math.max(0, ...parts.map((rows) => rows.length));
  const result = Array.from({ length: height }, () => "");
  parts.forEach((rows, index) => {
    result.forEach((_, rowIndex) => {
      const row = rows[rowIndex] ?? ".".repeat(rows[0]?.length ?? 0);
      result[rowIndex] += `${index > 0 ? ".".repeat(gap) : ""}${row}`;
    });
  });
  return result;
}

function rasterToRows(raster: {
  width: number;
  height: number;
  indices: ReadonlyArray<number>;
}): string[] {
  const cells = new Set(raster.indices);
  return Array.from({ length: raster.height }, (_, y) =>
    Array.from({ length: raster.width }, (_, x) =>
      cells.has(y * raster.width + x) ? "#" : ".",
    ).join(""),
  );
}

function scaleRows(rows: ReadonlyArray<string>, scale: number): string[] {
  return rows.flatMap((row) =>
    Array.from({ length: scale }, () =>
      Array.from(row)
        .map((cell) => (cell === "#" ? "#".repeat(scale) : ".".repeat(scale)))
        .join(""),
    ),
  );
}

const EXPECTED_TEXT_ROWS = composeRows(
  [GLYPHS.T, GLYPHS.E, GLYPHS.X, GLYPHS.T].map((rows) => [...rows]),
  1,
);

class FakeCanvasContext {
  private readonly canvas: FakeCanvas;
  font = `${NATIVE_FONT_HEIGHT}px monospace`;
  textBaseline = "alphabetic";
  textAlign = "left";
  fillStyle = "#111";
  imageSmoothingEnabled = false;

  constructor(canvas: FakeCanvas) {
    this.canvas = canvas;
  }

  private get scale(): number {
    const match = this.font.match(/(\d+(?:\.\d+)?)px/);
    const fontSize = Number(match?.[1] ?? NATIVE_FONT_HEIGHT);
    return Math.max(1, Math.round(fontSize / NATIVE_FONT_HEIGHT));
  }

  private get ascent(): number {
    return NATIVE_FONT_HEIGHT * this.scale;
  }

  private get descent(): number {
    return GLYPH_Y_OFFSET;
  }

  clearRect(): void {
    this.canvas.clear();
  }

  measureText(text: string) {
    const width = Array.from(text).reduce(
      (total, char) => total + glyphWidth(char) * this.scale + GLYPH_X_OFFSET,
      0,
    );
    return {
      width,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      actualBoundingBoxAscent: this.ascent,
      actualBoundingBoxDescent: this.descent,
    };
  }

  fillText(text: string, x: number, y: number): void {
    let cursorX = Math.round(x);
    const top = Math.round(y - this.ascent + GLYPH_Y_OFFSET);
    for (const char of Array.from(text)) {
      const rows = expandGlyph(char, this.scale);
      rows.forEach((row, rowIndex) => {
        Array.from(row).forEach((cell, columnIndex) => {
          if (cell !== "#") return;
          this.canvas.setAlpha(cursorX + GLYPH_X_OFFSET + columnIndex, top + rowIndex, 255);
        });
      });
      cursorX += glyphWidth(char) * this.scale + GLYPH_X_OFFSET;
    }
  }

  getImageData(_x: number, _y: number, width: number, height: number): FakeImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      data[index * 4 + 3] = this.canvas.alpha[index] ?? 0;
    }
    return { data };
  }
}

class FakeCanvas {
  private _width = 1;
  private _height = 1;
  alpha = new Uint8ClampedArray(1);
  private readonly context = new FakeCanvasContext(this);

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = Math.max(1, Math.floor(value));
    this.alpha = new Uint8ClampedArray(this._width * this._height);
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = Math.max(1, Math.floor(value));
    this.alpha = new Uint8ClampedArray(this._width * this._height);
  }

  getContext(kind: string): FakeCanvasContext | null {
    return kind === "2d" ? this.context : null;
  }

  clear(): void {
    this.alpha.fill(0);
  }

  setAlpha(x: number, y: number, value: number): void {
    if (x < 0 || y < 0 || x >= this._width || y >= this._height) return;
    this.alpha[y * this._width + x] = value;
  }
}

const originalDocument = globalThis.document;

beforeAll(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        if (tag !== "canvas") {
          throw new Error(`Unsupported fake element: ${tag}`);
        }
        return new FakeCanvas();
      },
    },
  });
});

afterAll(() => {
  if (typeof originalDocument === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as typeof globalThis & { document?: Document }).document;
    return;
  }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("text brush font presets", () => {
  it("defaults to Tiny5 at its native size", () => {
    expect(TEXT_BRUSH_FONT_CHOICES[0]?.label).toBe("Tiny5");
    expect(DEFAULT_TEXT_BRUSH_FONT_FAMILY).toBe(TEXT_BRUSH_FONT_CHOICES[0]?.family);
    expect(DEFAULT_TEXT_BRUSH_FONT_SIZE).toBe(5);
  });

  it("uses stepped scale-safe sizes for curated pixel fonts", () => {
    const tiny5Family = TEXT_BRUSH_FONT_CHOICES[0]!.family;
    expect(getTextBrushSizeChoices(tiny5Family)).toEqual([5, 10, 15, 20]);
    expect(formatTextBrushFontSizeLabel(tiny5Family, 15)).toBe("15px (3x)");
    expect(normalizeTextBrushFontSize(tiny5Family, 6)).toBe(5);
  });

  it("does not let a single antialiased subpixel fill a full pixel-font cell", () => {
    expect(reducePixelFontBlockAlpha(new Array(16).fill(255))).toBe(255);
    expect(reducePixelFontBlockAlpha([255, ...new Array(15).fill(0)])).toBe(0);
    expect(reducePixelFontBlockAlpha([...new Array(4).fill(255), ...new Array(12).fill(0)])).toBe(
      255,
    );
  });

  it("renders the Tiny5 brush using the same glyph layout as the preview model", () => {
    const tiny5Family = TEXT_BRUSH_FONT_CHOICES[0]!.family;
    const brush = rasterizeTextBrush("TEXT", tiny5Family, 5, "left");
    const preview = rasterizeTextBrushPreviewModel("TEXT", tiny5Family, 5, "left");

    expect(brush).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(rasterToRows(brush!)).toEqual(EXPECTED_TEXT_ROWS);
    expect(rasterToRows(preview!)).toEqual(scaleRows(EXPECTED_TEXT_ROWS, PREVIEW_SCALE));
  });

  it("keeps preview and brush exact for multiline pixel-font text", () => {
    const tiny5Family = TEXT_BRUSH_FONT_CHOICES[0]!.family;
    const brush = rasterizeTextBrush("TE\nXT", tiny5Family, 5, "right");
    const preview = rasterizeTextBrushPreviewModel("TE\nXT", tiny5Family, 5, "right");

    expect(brush).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(preview!.width).toBe(brush!.width * PREVIEW_SCALE);
    expect(preview!.height).toBe(brush!.height * PREVIEW_SCALE);
    expect(rasterToRows(preview!)).toEqual(scaleRows(rasterToRows(brush!), PREVIEW_SCALE));
    expect(getTextBrushPreviewFontSize(tiny5Family, 5)).toBe(20);
  });
});
