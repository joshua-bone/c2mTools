import { describe, expect, it } from "vitest";

import { isSelectionBorderStrokeHit } from "../web/src/selectionBorderHit.js";

describe("selection border hit testing", () => {
  const boardSize = { width: 32, height: 32 } as const;

  it("only treats the thin outer stroke as draggable", () => {
    const selectedIndices = [1 + 1 * 32];
    const point = { x: 1, y: 1 };

    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.05, y: 1.5 }, boardSize)).toBe(
      true,
    );
    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.95, y: 1.5 }, boardSize)).toBe(
      true,
    );
    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.5, y: 1.05 }, boardSize)).toBe(
      true,
    );
    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.5, y: 1.95 }, boardSize)).toBe(
      true,
    );

    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.5, y: 1.5 }, boardSize)).toBe(
      false,
    );
  });

  it("extends the draggable hit area slightly beyond the visible stroke", () => {
    const selectedIndices = [1 + 1 * 32];
    const point = { x: 1, y: 1 };

    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.2, y: 1.5 }, boardSize)).toBe(
      true,
    );
    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.8, y: 1.5 }, boardSize)).toBe(
      true,
    );
    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.5, y: 1.2 }, boardSize)).toBe(
      true,
    );
    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.5, y: 1.8 }, boardSize)).toBe(
      true,
    );

    expect(isSelectionBorderStrokeHit(selectedIndices, point, { x: 1.28, y: 1.5 }, boardSize)).toBe(
      false,
    );
  });

  it("does not allow dragging from internal edges of a larger selection", () => {
    const selectedIndices = [1 + 1 * 32, 2 + 1 * 32];

    expect(
      isSelectionBorderStrokeHit(selectedIndices, { x: 1, y: 1 }, { x: 1.95, y: 1.5 }, boardSize),
    ).toBe(false);
    expect(
      isSelectionBorderStrokeHit(selectedIndices, { x: 2, y: 1 }, { x: 2.05, y: 1.5 }, boardSize),
    ).toBe(false);
  });
});
