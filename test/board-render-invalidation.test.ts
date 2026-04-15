import { describe, expect, it } from "vitest";

import {
  resolveBoardMapRedrawPlan,
  resolveChangedMapCellIndices,
} from "../web/src/boardRenderInvalidation.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";

describe("board render invalidation", () => {
  it("returns only the changed indices for same-size maps", () => {
    const previousMap = createEmptyC2mDoc({ width: 10, height: 10 }).map!;
    const nextMap = {
      width: previousMap.width,
      height: previousMap.height,
      tiles: [...previousMap.tiles],
    };

    nextMap.tiles[0] = "WALL";
    nextMap.tiles[22] = {
      tile: "ANT",
      dir: "E",
      lower: "FLOOR",
    };

    expect(resolveChangedMapCellIndices(previousMap, nextMap)).toEqual([0, 22]);
  });

  it("treats resized maps as fully dirty", () => {
    const previousMap = createEmptyC2mDoc({ width: 10, height: 10 }).map!;
    const nextMap = createEmptyC2mDoc({ width: 12, height: 10 }).map!;

    expect(resolveChangedMapCellIndices(previousMap, nextMap)).toHaveLength(nextMap.tiles.length);
  });

  it("returns a partial redraw plan for small same-size edits when the canvas can be reused", () => {
    const previousMap = createEmptyC2mDoc({ width: 100, height: 100 }).map!;
    const nextMap = {
      width: previousMap.width,
      height: previousMap.height,
      tiles: [...previousMap.tiles],
    };

    nextMap.tiles[0] = "WALL";
    nextMap.tiles[404] = "WATER";
    nextMap.tiles[9999] = "EXIT";

    expect(
      resolveBoardMapRedrawPlan(previousMap, nextMap, {
        canReuseCanvas: true,
        partialThreshold: 8,
      }),
    ).toEqual({
      kind: "partial",
      indices: [0, 404, 9999],
    });
  });

  it("falls back to a full redraw when reuse is unsafe or the diff is too large", () => {
    const previousMap = createEmptyC2mDoc({ width: 10, height: 10 }).map!;
    const nextMap = {
      width: previousMap.width,
      height: previousMap.height,
      tiles: [...previousMap.tiles],
    };
    nextMap.tiles[0] = "WALL";
    nextMap.tiles[1] = "WATER";

    expect(
      resolveBoardMapRedrawPlan(previousMap, nextMap, {
        canReuseCanvas: false,
        partialThreshold: 10,
      }),
    ).toEqual({ kind: "full" });
    expect(
      resolveBoardMapRedrawPlan(previousMap, nextMap, {
        canReuseCanvas: true,
        partialThreshold: 1,
      }),
    ).toEqual({ kind: "full" });
  });
});
