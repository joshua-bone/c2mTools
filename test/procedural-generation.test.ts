import { describe, expect, it } from "vitest";

import { flattenCellLayers } from "../src/c2m/cellStack.js";
import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { transformTileSpec } from "../src/c2m/levelTransform.js";
import type { Dir, TileSpecJson } from "../src/c2m/mapCodec.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_SEED,
  STACK_SLOT_HEIGHT,
  countTerrainTiles,
  generateProceduralLevel,
  generateCombinations,
  type StackPosition,
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

function flipWallsVertical(walls: ReadonlyArray<Dir>): Dir[] {
  const flipped = walls.map((wall) => {
    if (wall === "N") return "S";
    if (wall === "S") return "N";
    return wall;
  });
  const order: ReadonlyArray<Dir> = ["N", "E", "S", "W"];
  return order.filter((wall) => flipped.includes(wall));
}

function resolveSlotPoint(position: StackPosition, localX: number, localY: number) {
  return {
    x: position.x + localX,
    y:
      position.facing === "N" ? position.y + localY : position.y + (STACK_SLOT_HEIGHT - 1 - localY),
  };
}

function readLocalCell(
  level: ReturnType<typeof generateProceduralLevel>,
  position: StackPosition,
  localX: number,
  localY: number,
) {
  const point = resolveSlotPoint(position, localX, localY);
  return flattenCellLayers(level.map.tiles[pointToIndex(point.x, point.y, level.map.width)]!);
}

function expectedBarrierSpec(
  tool: keyof typeof ITEM_TILE_BY_TOOL,
  facing: StackPosition["facing"],
): TileSpecJson {
  let spec: TileSpecJson;
  switch (tool) {
    case "yellowkey":
      spec = "YELLOW_DOOR";
      break;
    case "redkey":
      spec = "RED_DOOR";
      break;
    case "bluekey":
      spec = "BLUE_DOOR";
      break;
    case "greenkey":
      spec = "GREEN_DOOR";
      break;
    case "fireboots":
      spec = "FIRE";
      break;
    case "flippers":
      spec = "WATER";
      break;
    case "forceboots":
      spec = "FORCE_N";
      break;
    case "hikingboots":
      spec = "GRAVEL";
      break;
    case "rrsign":
      spec = {
        tile: "RAILROAD_TRACK",
        modifiers: [
          {
            kind: "TRACKS",
            pieces: ["HORIZONTAL"],
            active: "H",
            entered: "W",
          },
        ],
      };
      break;
  }

  return facing === "N" ? spec : transformTileSpec(spec, "FLIP_V");
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
    expect(finalStack.facing).toBe("S");
    expect(readLocalCell(level, finalStack, 0, 0).terrain.tile).toBe("CHIP_SOCKET");
    expect(readLocalCell(level, finalStack, 1, 0).terrain.tile).toBe("EXIT");

    const northBarrierCount = level.stackPositions
      .slice(0, -1)
      .filter((position) => position.facing === "N").length;
    const southBarrierCount = level.stackPositions
      .slice(0, -1)
      .filter((position) => position.facing === "S").length;

    expect(countTerrainTiles(level.map, "POP_UP_WALL")).toBe(level.barrierCombos.length);
    expect(countTerrainTiles(level.map, "SWIVEL_DOOR_NE")).toBe(northBarrierCount);
    expect(countTerrainTiles(level.map, "SWIVEL_DOOR_SE")).toBe(southBarrierCount);
    expect(countTerrainTiles(level.map, "PINK_BUTTON")).toBe(0);
    expect(countTerrainTiles(level.map, "PURPLE_TOGGLE_WALL")).toBe(0);
    expect(countTerrainTiles(level.map, "CHIP_SOCKET")).toBe(1);
    expect(countTerrainTiles(level.map, "EXIT")).toBe(1);

    for (let stackIndex = 0; stackIndex < level.barrierCombos.length; stackIndex++) {
      const barrierCombo = level.barrierCombos[stackIndex]!;
      const grantedCombo = level.plan.grantsByStack[stackIndex] ?? null;
      const position = level.stackPositions[stackIndex]!;

      const topLeft = readLocalCell(level, position, 0, 0);
      expect(topLeft.terrain.tile).toBe("POP_UP_WALL");
      expect(topLeft.thinWalls?.thinWallCanopy?.walls).toEqual(["E", "W"]);
      expect(topLeft.noSign).toBeUndefined();

      for (let barrierIndex = 0; barrierIndex < 4; barrierIndex++) {
        const cell = readLocalCell(level, position, 0, barrierIndex + 1);
        const expectedTerrain =
          barrierIndex < barrierCombo.length
            ? flattenCellLayers(expectedBarrierSpec(barrierCombo[barrierIndex]!, position.facing))
                .terrain.tile
            : "FLOOR";
        const expectedWalls =
          barrierIndex === 3 ? (position.facing === "N" ? ["W", "S"] : ["N", "W"]) : ["E", "W"];

        expect(cell.terrain.tile).toBe(expectedTerrain);
        expect(cell.thinWalls?.thinWallCanopy?.walls).toEqual(expectedWalls);
        expect(cell.noSign).toBeUndefined();
      }

      const firstGrantedTool = grantedCombo?.[0] ?? null;
      const secondThiefTile =
        firstGrantedTool !== null && KEY_TOOLS.has(firstGrantedTool) ? "TOOL_THIEF" : "KEY_THIEF";
      const firstThiefTile = secondThiefTile === "TOOL_THIEF" ? "KEY_THIEF" : "TOOL_THIEF";

      const firstThiefLayers = readLocalCell(level, position, 1, 4);
      expect(firstThiefLayers.terrain.tile).toBe(firstThiefTile);
      expect(firstThiefLayers.item?.tile).toBe("IC_CHIP");
      expect(firstThiefLayers.thinWalls?.thinWallCanopy?.walls).toEqual(
        position.facing === "N" ? ["E", "S"] : ["N", "E"],
      );

      const secondThiefLayers = readLocalCell(level, position, 1, 3);
      expect(secondThiefLayers.terrain.tile).toBe(secondThiefTile);
      expect(secondThiefLayers.item?.tile).toBe(
        firstGrantedTool ? ITEM_TILE_BY_TOOL[firstGrantedTool] : undefined,
      );
      expect(secondThiefLayers.thinWalls?.thinWallCanopy?.walls).toEqual(["E", "W"]);

      const remainingGrantTools = grantedCombo?.slice(1) ?? [];
      const rightColumnExpectations: Array<{
        localY: number;
        terrain: string;
        item?: string;
        walls: ReadonlyArray<Dir>;
      }> = [
        {
          localY: 2,
          terrain: "FLOOR",
          ...(remainingGrantTools[0] ? { item: ITEM_TILE_BY_TOOL[remainingGrantTools[0]] } : {}),
          walls: ["E", "W"],
        },
        {
          localY: 1,
          terrain: "FLOOR",
          ...(remainingGrantTools[1] ? { item: ITEM_TILE_BY_TOOL[remainingGrantTools[1]] } : {}),
          walls: ["E", "W"],
        },
        {
          localY: 0,
          terrain: position.facing === "N" ? "SWIVEL_DOOR_NE" : "SWIVEL_DOOR_SE",
          ...(remainingGrantTools[2] ? { item: ITEM_TILE_BY_TOOL[remainingGrantTools[2]] } : {}),
          walls: ["E", "W"],
        },
      ];

      for (const expected of rightColumnExpectations) {
        const cell = readLocalCell(level, position, 1, expected.localY);
        expect(cell.terrain.tile).toBe(expected.terrain);
        expect(cell.item?.tile).toBe(expected.item);
        expect(cell.thinWalls?.thinWallCanopy?.walls).toEqual(
          position.facing === "N" ? [...expected.walls] : flipWallsVertical(expected.walls),
        );
        expect(cell.noSign).toBeUndefined();
      }
    }

    const bytes = encodeC2mFromJsonV1(level.doc);
    const decoded = decodeC2mToJsonV1(bytes);
    expect(decoded.map?.width).toBe(BOARD_WIDTH);
    expect(decoded.map?.height).toBe(BOARD_HEIGHT);
  });
});
