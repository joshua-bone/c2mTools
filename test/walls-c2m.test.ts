import { describe, expect, it } from "vitest";
import {
  createWallGrid,
  setWallMaskBit,
  wallMask32FromBytes,
  WALL_MASK_BYTE_LENGTH,
} from "dattools/walls-core";

import { pointToIndex } from "../web/src/editor/boardGeometry.js";
import {
  applyBankWallMask32ToC2mMap,
  applyGeneratedWallGridToC2mMap,
} from "../web/src/wallsC2m.js";

describe("c2m walls import adapters", () => {
  it("replaces the current map with the bank layout size", () => {
    const bytes = new Uint8Array(WALL_MASK_BYTE_LENGTH);
    setWallMaskBit(bytes, pointToIndex({ x: 2, y: 3 }, { width: 32 }), true);
    const wallKey = wallMask32FromBytes(bytes).key;

    const nextMap = applyBankWallMask32ToC2mMap(wallKey);

    expect(nextMap.width).toBe(32);
    expect(nextMap.height).toBe(32);
    expect(nextMap.tiles[pointToIndex({ x: 2, y: 3 }, nextMap)]).toBe("WALL");
    expect(nextMap.tiles[pointToIndex({ x: 0, y: 0 }, nextMap)]).toBe("FLOOR");
  });

  it("replaces the current map with the generated grid size", () => {
    const grid = createWallGrid(14, 11);
    grid.cells[pointToIndex({ x: 5, y: 4 }, { width: grid.width })] = 1;

    const nextMap = applyGeneratedWallGridToC2mMap(grid);

    expect(nextMap.width).toBe(14);
    expect(nextMap.height).toBe(11);
    expect(nextMap.tiles[pointToIndex({ x: 5, y: 4 }, nextMap)]).toBe("WALL");
    expect(nextMap.tiles[pointToIndex({ x: 0, y: 0 }, nextMap)]).toBe("FLOOR");
  });
});
