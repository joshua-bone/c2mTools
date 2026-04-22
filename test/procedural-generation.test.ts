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

const ITEM_TILE_BY_TOOL = {
  greenkey: "GREEN_KEY",
  redkey: "RED_KEY",
  bluekey: "BLUE_KEY",
  yellowkey: "YELLOW_KEY",
  flippers: "FLIPPERS",
  fireboots: "FIRE_BOOTS",
  forceboots: "SUCTION_BOOTS",
  hikingboots: "HIKING_BOOTS",
  rrsign: "RAILROAD_SIGN",
} as const;

const KEY_TOOLS = new Set(["greenkey", "redkey", "bluekey", "yellowkey"]);

function pointToIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

function expectedBarrierTerrain(tool: keyof typeof ITEM_TILE_BY_TOOL): string {
  switch (tool) {
    case "yellowkey":
      return "YELLOW_DOOR";
    case "redkey":
      return "RED_DOOR";
    case "bluekey":
      return "BLUE_DOOR";
    case "greenkey":
      return "GREEN_DOOR";
    case "fireboots":
      return "FIRE";
    case "flippers":
      return "WATER";
    case "forceboots":
      return "FORCE_N";
    case "hikingboots":
      return "GRAVEL";
    case "rrsign":
      return "RAILROAD_TRACK";
  }
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
    expect(level.stackPositions).toHaveLength(882);
    expect(level.barrierCombos).toHaveLength(881);
    expect(level.plan.order).toHaveLength(881);
    expect(level.plan.order.at(-1)).toBe(880);

    const startLayers = flattenCellLayers(level.map.tiles[0]!);
    expect(startLayers.mob?.tile).toBe("MELINDA");
    expect(startLayers.terrain.tile).toBe("FLOOR");

    const finalStack = level.stackPositions[level.stackPositions.length - 1]!;
    const socketLayers = flattenCellLayers(
      level.map.tiles[pointToIndex(finalStack.x, finalStack.y, level.map.width)]!,
    );
    const exitLayers = flattenCellLayers(
      level.map.tiles[pointToIndex(finalStack.x, finalStack.y + 9, level.map.width)]!,
    );
    expect(socketLayers.terrain.tile).toBe("CHIP_SOCKET");
    expect(exitLayers.terrain.tile).toBe("EXIT");
    expect(exitLayers.thinWalls?.thinWallCanopy?.walls).toEqual(["E", "W", "S"]);

    expect(countTerrainTiles(level.map, "POP_UP_WALL")).toBe(881);
    expect(countTerrainTiles(level.map, "SWIVEL_DOOR_SE")).toBe(881);
    expect(countTerrainTiles(level.map, "PINK_BUTTON")).toBe(0);
    expect(countTerrainTiles(level.map, "PURPLE_TOGGLE_WALL")).toBe(0);
    expect(countTerrainTiles(level.map, "CHIP_SOCKET")).toBe(1);
    expect(countTerrainTiles(level.map, "EXIT")).toBe(1);

    for (let stackIndex = 0; stackIndex < level.barrierCombos.length; stackIndex++) {
      const barrierCombo = level.barrierCombos[stackIndex]!;
      const grantedCombo = level.plan.grantsByStack[stackIndex] ?? null;
      const position = level.stackPositions[stackIndex]!;
      const topLayers = flattenCellLayers(
        level.map.tiles[pointToIndex(position.x, position.y, level.map.width)]!,
      );
      expect(topLayers.terrain.tile).toBe("POP_UP_WALL");
      expect(topLayers.thinWalls?.thinWallCanopy?.walls).toEqual(["E", "W"]);
      expect(topLayers.noSign).toBeUndefined();

      for (let barrierIndex = 0; barrierIndex < 4; barrierIndex++) {
        const cell =
          level.map.tiles[
            pointToIndex(position.x, position.y + 1 + barrierIndex, level.map.width)
          ]!;
        const layers = flattenCellLayers(cell);
        expect(layers.terrain.tile).toBe(
          barrierIndex < barrierCombo.length
            ? expectedBarrierTerrain(barrierCombo[barrierIndex]!)
            : "FLOOR",
        );
        expect(layers.noSign).toBeUndefined();
      }

      const firstGrantedTool = grantedCombo?.[0] ?? null;
      const secondThiefTile =
        firstGrantedTool !== null && KEY_TOOLS.has(firstGrantedTool) ? "TOOL_THIEF" : "KEY_THIEF";
      const firstThiefTile = secondThiefTile === "TOOL_THIEF" ? "KEY_THIEF" : "TOOL_THIEF";

      const firstThiefLayers = flattenCellLayers(
        level.map.tiles[pointToIndex(position.x, position.y + 5, level.map.width)]!,
      );
      expect(firstThiefLayers.terrain.tile).toBe(firstThiefTile);
      expect(firstThiefLayers.item?.tile).toBe("IC_CHIP");

      const secondThiefLayers = flattenCellLayers(
        level.map.tiles[pointToIndex(position.x, position.y + 6, level.map.width)]!,
      );
      expect(secondThiefLayers.terrain.tile).toBe(secondThiefTile);
      expect(secondThiefLayers.item?.tile).toBe(
        firstGrantedTool ? ITEM_TILE_BY_TOOL[firstGrantedTool] : undefined,
      );

      const remainingGrantTools = grantedCombo?.slice(1) ?? [];
      const firstRemainingGrantRow = position.y + 10 - remainingGrantTools.length;
      for (let relY = 7; relY <= 9; relY++) {
        const row = position.y + relY;
        const layers = flattenCellLayers(
          level.map.tiles[pointToIndex(position.x, row, level.map.width)]!,
        );
        const expectedTerrain = relY === 9 ? "SWIVEL_DOOR_SE" : "FLOOR";
        const grantIndex =
          row >= firstRemainingGrantRow ? row - firstRemainingGrantRow : Number.NEGATIVE_INFINITY;
        const expectedItem =
          grantIndex >= 0 && grantIndex < remainingGrantTools.length
            ? ITEM_TILE_BY_TOOL[remainingGrantTools[grantIndex]!]
            : undefined;

        expect(layers.terrain.tile).toBe(expectedTerrain);
        expect(layers.item?.tile).toBe(expectedItem);
        expect(layers.noSign).toBeUndefined();
      }
    }

    const bytes = encodeC2mFromJsonV1(level.doc);
    const decoded = decodeC2mToJsonV1(bytes);
    expect(decoded.map?.width).toBe(BOARD_WIDTH);
    expect(decoded.map?.height).toBe(BOARD_HEIGHT);
  });
});
