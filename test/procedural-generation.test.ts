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
} from "../procedural_generation/algorithms/whopper_swapper.js";
import {
  DEFAULT_ALGORITHM_NAME,
  generateProceduralLevel as generateProceduralLevelFromRegistry,
  listAlgorithmNames,
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

  it("exposes whopper_swapper through the algorithm registry", () => {
    expect(listAlgorithmNames()).toEqual(["whopper_swapper"]);

    const level = generateProceduralLevelFromRegistry({
      algorithm: DEFAULT_ALGORITHM_NAME,
      seed: DEFAULT_SEED,
    });

    expect(level.algorithmName).toBe("whopper_swapper");
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

    for (let stackIndex = 0; stackIndex < level.barrierCombos.length; stackIndex++) {
      const combo = level.barrierCombos[stackIndex]!;
      const position = level.stackPositions[stackIndex]!;
      const expectedNoSignIndex = combo.findIndex(
        (tool) =>
          tool !== "greenkey" && tool !== "redkey" && tool !== "bluekey" && tool !== "yellowkey",
      );

      for (let barrierIndex = 0; barrierIndex < combo.length; barrierIndex++) {
        const cell =
          level.map.tiles[pointToIndex(position.x, position.y + barrierIndex, level.map.width)]!;
        const layers = flattenCellLayers(cell);
        const hasNoSign = layers.noSign?.tile === "NOT_ALLOWED_MARKER";
        expect(hasNoSign).toBe(barrierIndex === expectedNoSignIndex);
      }
    }

    const bytes = encodeC2mFromJsonV1(level.doc);
    const decoded = decodeC2mToJsonV1(bytes);
    expect(decoded.map?.width).toBe(BOARD_WIDTH);
    expect(decoded.map?.height).toBe(BOARD_HEIGHT);
  });
});
