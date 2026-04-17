import { describe, expect, it } from "vitest";

import {
  DEFAULT_TEXT_BRUSH_FONT_FAMILY,
  DEFAULT_TEXT_BRUSH_FONT_SIZE,
  TEXT_BRUSH_FONT_CHOICES,
  formatTextBrushFontSizeLabel,
  getTextBrushSizeChoices,
  normalizeTextBrushFontSize,
} from "../web/src/editor/textBrush.js";

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
});
