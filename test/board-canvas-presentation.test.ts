import { describe, expect, it } from "vitest";

import {
  clampBoardPan,
  resolveBoardCellScreenRect,
  resolveBoardScreenRect,
  resolveVisibleBoardCellWindow,
  viewportClientPointToBoardPoint,
  boardPointToCell,
} from "../web/src/boardCanvasPresentation.js";

describe("board canvas presentation", () => {
  it("centers variable-size maps and clamps pan to keep them partially visible", () => {
    const rect = resolveBoardScreenRect({
      boardPixelWidth: 20 * 32,
      boardPixelHeight: 12 * 32,
      boardPan: { x: 0, y: 0 },
      boardZoom: 1,
      viewportWidth: 1000,
      viewportHeight: 800,
    });

    expect(rect).toEqual({
      x: 180,
      y: 208,
      width: 640,
      height: 384,
    });

    expect(
      clampBoardPan({
        boardPixelWidth: 20 * 32,
        boardPixelHeight: 12 * 32,
        boardPan: { x: 1000, y: -1000 },
        boardZoom: 1,
        viewportWidth: 1000,
        viewportHeight: 800,
      }),
    ).toEqual({
      x: 724,
      y: -496,
    });
  });

  it("maps viewport points to cells and resolves screen rects for arbitrary board sizes", () => {
    const boardRect = resolveBoardScreenRect({
      boardPixelWidth: 20 * 32,
      boardPixelHeight: 12 * 32,
      boardPan: { x: -260, y: -120 },
      boardZoom: 1.5,
      viewportWidth: 900,
      viewportHeight: 700,
    });

    const boardPoint = viewportClientPointToBoardPoint(
      {
        left: 100,
        top: 40,
        width: 900,
        height: 700,
      },
      {
        clientX: 338,
        clientY: 228,
      },
      boardRect,
      20 * 32,
      12 * 32,
    );

    expect(boardPoint).toEqual({
      x: 352,
      y: 164,
    });
    expect(boardPointToCell(boardPoint, { width: 20, height: 12 })).toEqual({
      x: 11,
      y: 5,
    });
    expect(
      resolveBoardCellScreenRect({ x: 6, y: 4 }, { width: 20, height: 12 }, boardRect),
    ).toEqual({
      x: -2,
      y: 134,
      width: 48,
      height: 48,
    });
  });

  it("resolves the visible cell window for cropped large boards", () => {
    const boardRect = resolveBoardScreenRect({
      boardPixelWidth: 20 * 32,
      boardPixelHeight: 12 * 32,
      boardPan: { x: -260, y: -120 },
      boardZoom: 1.5,
      viewportWidth: 900,
      viewportHeight: 700,
    });

    expect(
      resolveVisibleBoardCellWindow(boardRect, { width: 20, height: 12 }, 900, 700, 1),
    ).toEqual({
      startColumn: 5,
      endColumn: 19,
      startRow: 0,
      endRow: 11,
    });
  });
});
