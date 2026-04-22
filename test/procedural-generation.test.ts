import { describe, expect, it } from "vitest";

import { flattenCellLayers } from "../src/c2m/cellStack.js";
import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_SEED,
  countTerrainTiles,
  generateProceduralLevel,
  generateCombinations,
} from "../procedural_generation/generator.js";

function pointToIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

describe("procedural level generation", () => {
  it("matches the updated combo space", () => {
    const combos = generateCombinations();
    expect(combos).toHaveLength(399);
    expect(combos.filter((combo) => combo.length === 1)).toHaveLength(9);
    expect(combos.filter((combo) => combo.length === 2)).toHaveLength(39);
    expect(combos.filter((combo) => combo.length === 3)).toHaveLength(111);
    expect(combos.filter((combo) => combo.length === 4)).toHaveLength(240);
  });

  it("builds a deterministic solvable level and round-trips to c2m", () => {
    const level = generateProceduralLevel(DEFAULT_SEED);

    expect(level.map.width).toBe(BOARD_WIDTH);
    expect(level.map.height).toBe(BOARD_HEIGHT);
    expect(level.stackPositions).toHaveLength(784);
    expect(level.barrierCombos).toHaveLength(783);
    expect(level.plan.order).toHaveLength(783);
    expect(level.plan.order.at(-1)).toBe(782);

    const startLayers = flattenCellLayers(level.map.tiles[0]!);
    expect(startLayers.mob?.tile).toBe("MELINDA");
    expect(startLayers.terrain.tile).toBe("FLOOR");

    const finalStack = level.stackPositions[level.stackPositions.length - 1]!;
    const exitCell =
      level.map.tiles[pointToIndex(finalStack.x, finalStack.y + 10, level.map.width)]!;
    const exitLayers = flattenCellLayers(exitCell);
    expect(exitLayers.terrain.tile).toBe("EXIT");
    expect(exitLayers.thinWalls?.thinWallCanopy?.walls).toEqual(["E", "W", "S"]);

    expect(countTerrainTiles(level.map, "PINK_BUTTON")).toBe(783);
    expect(countTerrainTiles(level.map, "PURPLE_TOGGLE_WALL")).toBe(783);
    expect(countTerrainTiles(level.map, "CHIP_SOCKET")).toBe(1);
    expect(countTerrainTiles(level.map, "EXIT")).toBe(1);

    const bytes = encodeC2mFromJsonV1(level.doc);
    const decoded = decodeC2mToJsonV1(bytes);
    expect(decoded.map?.width).toBe(BOARD_WIDTH);
    expect(decoded.map?.height).toBe(BOARD_HEIGHT);
  });
});
