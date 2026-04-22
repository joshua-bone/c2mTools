import {
  buildCellFromLayers,
  flattenCellLayers,
  type C2mCellLayers,
} from "../src/c2m/cellStack.js";
import type { C2mJsonV1 } from "../src/c2m/c2mJsonV1.js";
import type { Dir, MapJson, TileSpecJson, TileSpecObjJson } from "../src/c2m/mapCodec.js";

export const BOARD_WIDTH = 100;
export const BOARD_HEIGHT = 100;
export const BORDER_SIZE = 1;
export const STACK_HEIGHT = 11;
export const STACK_ROW_GAP = 1;
export const DEFAULT_SEED = 20260422;

const STACK_WALLS: ReadonlyArray<Dir> = Object.freeze(["E", "W"]);
const FINAL_EXIT_WALLS: ReadonlyArray<Dir> = Object.freeze(["E", "W", "S"]);

const toolDefs = [
  { name: "greenkey", max: 4 },
  { name: "redkey", max: 4 },
  { name: "bluekey", max: 4 },
  { name: "yellowkey", max: 1 },
  { name: "flippers", max: 1 },
  { name: "fireboots", max: 1 },
  { name: "forceboots", max: 1 },
  { name: "hikingboots", max: 1 },
  { name: "rrsign", max: 1 },
] as const;

export type ToolName = (typeof toolDefs)[number]["name"];
export type Combo = ReadonlyArray<ToolName>;

export type StackPosition = Readonly<{
  x: number;
  y: number;
}>;

export type TraversalPlan = Readonly<{
  seed: number;
  sinkStackIndex: number;
  order: ReadonlyArray<number>;
  startCombo: Combo;
  grantsByStack: ReadonlyArray<Combo | null>;
  nextStackBySource: ReadonlyArray<number | null>;
}>;

export type VerificationSummary = Readonly<{
  stackCount: number;
  barrierStackCount: number;
  uniqueComboCount: number;
  totalBarrierTiles: number;
  totalChipCount: number;
}>;

export type GeneratedLevel = Readonly<{
  doc: C2mJsonV1;
  map: MapJson;
  stackPositions: ReadonlyArray<StackPosition>;
  allCombos: ReadonlyArray<Combo>;
  barrierCombos: ReadonlyArray<Combo>;
  plan: TraversalPlan;
  verification: VerificationSummary;
}>;

const ITEM_TILE_BY_TOOL: Readonly<Record<ToolName, string>> = Object.freeze({
  greenkey: "GREEN_KEY",
  redkey: "RED_KEY",
  bluekey: "BLUE_KEY",
  yellowkey: "YELLOW_KEY",
  flippers: "FLIPPERS",
  fireboots: "FIRE_BOOTS",
  forceboots: "SUCTION_BOOTS",
  hikingboots: "HIKING_BOOTS",
  rrsign: "RAILROAD_SIGN",
});

function toTileObject(spec: TileSpecJson): TileSpecObjJson {
  return typeof spec === "string" ? { tile: spec } : spec;
}

function comboKey(combo: Combo): string {
  return combo.join("|");
}

function combosEqual(a: Combo, b: Combo): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildComboCounts(combos: ReadonlyArray<Combo>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const combo of combos) {
    const key = comboKey(combo);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function buildCountsSignature(counts: ReadonlyMap<string, number>): string {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}:${count}`)
    .join(";");
}

function buildThinWallLayer(walls: ReadonlyArray<Dir>): TileSpecObjJson {
  return {
    tile: "THINWALL_CANOPY",
    thinWallCanopy: {
      walls: [...walls],
      canopy: false,
    },
  };
}

function buildCell(
  terrain: TileSpecJson,
  options: Readonly<{
    itemTool?: ToolName;
    itemTile?: string;
    mobTile?: string;
    mobDir?: Dir;
    noSign?: boolean;
    thinWalls?: ReadonlyArray<Dir>;
  }> = {},
): TileSpecJson {
  const layers: C2mCellLayers = {
    terrain: toTileObject(terrain),
    ...(options.itemTool
      ? {
          item: {
            tile: ITEM_TILE_BY_TOOL[options.itemTool],
          },
        }
      : {}),
    ...(options.itemTile
      ? {
          item: {
            tile: options.itemTile,
          },
        }
      : {}),
    ...(options.mobTile
      ? {
          mob: {
            tile: options.mobTile,
            ...(options.mobDir ? { dir: options.mobDir } : {}),
          },
        }
      : {}),
    ...(options.noSign
      ? {
          noSign: {
            tile: "NOT_ALLOWED_MARKER",
          },
        }
      : {}),
    ...(options.thinWalls && options.thinWalls.length > 0
      ? {
          thinWalls: buildThinWallLayer(options.thinWalls),
        }
      : {}),
  };

  return buildCellFromLayers(layers);
}

function buildWiredTerrain(tile: string, wires: ReadonlyArray<Dir>): TileSpecObjJson {
  return {
    tile,
    modifiers: [
      {
        kind: "WIRES",
        wires: [...wires],
        tunnels: [],
      },
    ],
  };
}

function buildRailroadBarrier(): TileSpecObjJson {
  return {
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
}

function buildBarrierTerrain(tool: ToolName): TileSpecJson {
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
      return buildRailroadBarrier();
  }
}

function createMulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let state = Math.imul(value ^ (value >>> 15), 1 | value);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(values: T[], nextRandom: () => number): void {
  for (let i = values.length - 1; i > 0; i--) {
    const swapIndex = Math.floor(nextRandom() * (i + 1));
    const current = values[i]!;
    values[i] = values[swapIndex]!;
    values[swapIndex] = current;
  }
}

function pointToIndex(x: number, y: number, map: Pick<MapJson, "width">): number {
  return y * map.width + x;
}

function setCell(
  tiles: TileSpecJson[],
  map: Pick<MapJson, "width">,
  x: number,
  y: number,
  cell: TileSpecJson,
) {
  tiles[pointToIndex(x, y, map)] = cell;
}

function buildStackFloorCell(walls: ReadonlyArray<Dir> = STACK_WALLS): TileSpecJson {
  return buildCell("FLOOR", { thinWalls: walls });
}

function buildBarrierCell(tool: ToolName): TileSpecJson {
  return buildCell(buildBarrierTerrain(tool), {
    noSign: true,
    thinWalls: STACK_WALLS,
  });
}

function buildPinkButtonCell(itemTool?: ToolName): TileSpecJson {
  return buildCell(buildWiredTerrain("PINK_BUTTON", ["S"]), {
    ...(itemTool ? { itemTool } : {}),
    thinWalls: STACK_WALLS,
  });
}

function buildChipWallCell(): TileSpecJson {
  return buildCell(buildWiredTerrain("PURPLE_TOGGLE_WALL", ["N"]), {
    itemTile: "IC_CHIP",
    thinWalls: STACK_WALLS,
  });
}

function createEmptyMap(width = BOARD_WIDTH, height = BOARD_HEIGHT): MapJson {
  return {
    width,
    height,
    tiles: Array<TileSpecJson>(width * height).fill("FLOOR"),
  };
}

export function generateCombinations(maxSize = 4): Combo[] {
  const out: ToolName[][] = [];
  const counts = new Array<number>(toolDefs.length).fill(0);

  function rec(index: number, used: number): void {
    if (index === toolDefs.length) {
      if (used >= 1) {
        const combo: ToolName[] = [];
        for (let i = 0; i < toolDefs.length; i++) {
          const tool = toolDefs[i];
          if (!tool) continue;
          for (let n = 0; n < counts[i]!; n++) {
            combo.push(tool.name);
          }
        }
        out.push(combo);
      }
      return;
    }

    const tool = toolDefs[index]!;
    const limit = Math.min(tool.max, maxSize - used);
    for (let take = 0; take <= limit; take++) {
      counts[index] = take;
      rec(index + 1, used + take);
    }
    counts[index] = 0;
  }

  rec(0, 0);
  return out;
}

export function computeStackPositions(
  width = BOARD_WIDTH,
  height = BOARD_HEIGHT,
): ReadonlyArray<StackPosition> {
  const positions: StackPosition[] = [];
  const minX = BORDER_SIZE;
  const maxX = width - BORDER_SIZE - 1;
  const maxY = height - BORDER_SIZE - 1;

  for (
    let startY = BORDER_SIZE;
    startY + STACK_HEIGHT - 1 <= maxY;
    startY += STACK_HEIGHT + STACK_ROW_GAP
  ) {
    for (let x = minX; x <= maxX; x++) {
      positions.push({ x, y: startY });
    }
  }

  return positions;
}

export function buildBarrierCombos(
  barrierStackCount: number,
  allCombos = generateCombinations(),
): ReadonlyArray<Combo> {
  const barrierCombos: Combo[] = [];
  for (let i = 0; i < barrierStackCount; i++) {
    barrierCombos.push(allCombos[i % allCombos.length]!);
  }
  return barrierCombos;
}

export function buildTraversalPlan(
  seed: number,
  barrierCombos: ReadonlyArray<Combo>,
  sinkStackIndex: number,
): TraversalPlan {
  if (sinkStackIndex < 0 || sinkStackIndex >= barrierCombos.length) {
    throw new Error(`Invalid sink stack index ${sinkStackIndex}`);
  }

  const nextRandom = createMulberry32(seed);
  const order = Array.from({ length: barrierCombos.length }, (_, index) => index).filter(
    (index) => index !== sinkStackIndex,
  );
  shuffleInPlace(order, nextRandom);
  order.push(sinkStackIndex);

  const grantsByStack: Array<Combo | null> = Array(barrierCombos.length).fill(null);
  const nextStackBySource: Array<number | null> = Array(barrierCombos.length).fill(null);

  for (let step = 0; step < order.length - 1; step++) {
    const source = order[step]!;
    const target = order[step + 1]!;
    grantsByStack[source] = barrierCombos[target]!;
    nextStackBySource[source] = target;
  }

  return {
    seed,
    sinkStackIndex,
    order,
    startCombo: barrierCombos[order[0]!]!,
    grantsByStack,
    nextStackBySource,
  };
}

export function verifyTraversalPlan(
  barrierCombos: ReadonlyArray<Combo>,
  plan: TraversalPlan,
): VerificationSummary {
  if (plan.order.length !== barrierCombos.length) {
    throw new Error(
      `Traversal order length ${plan.order.length} does not match barrier stack count ${barrierCombos.length}`,
    );
  }
  if (plan.order[plan.order.length - 1] !== plan.sinkStackIndex) {
    throw new Error("Traversal order does not end on the sink stack");
  }

  const seen = new Set<number>();
  for (const stackIndex of plan.order) {
    if (!Number.isInteger(stackIndex) || stackIndex < 0 || stackIndex >= barrierCombos.length) {
      throw new Error(`Traversal order contains invalid stack index ${stackIndex}`);
    }
    if (seen.has(stackIndex)) {
      throw new Error(`Traversal order repeats stack index ${stackIndex}`);
    }
    seen.add(stackIndex);
  }

  const barrierCounts = buildComboCounts(barrierCombos);
  const sourceCombos = [
    plan.startCombo,
    ...plan.grantsByStack.filter((combo): combo is Combo => combo !== null),
  ];
  const sourceCounts = buildComboCounts(sourceCombos);
  if (buildCountsSignature(sourceCounts) !== buildCountsSignature(barrierCounts)) {
    throw new Error("Granted combos do not match barrier combo counts");
  }

  let currentCombo: Combo | null = plan.startCombo;
  for (let step = 0; step < plan.order.length; step++) {
    const stackIndex = plan.order[step]!;
    const barrierCombo = barrierCombos[stackIndex]!;
    if (!currentCombo || !combosEqual(currentCombo, barrierCombo)) {
      throw new Error(`Traversal step ${step} does not match the required barrier combo`);
    }

    const expectedNext = step + 1 < plan.order.length ? plan.order[step + 1]! : null;
    if (plan.nextStackBySource[stackIndex] !== expectedNext) {
      throw new Error(`Traversal step ${step} does not point to the expected next stack`);
    }

    currentCombo = plan.grantsByStack[stackIndex] ?? null;
  }

  if (currentCombo !== null) {
    throw new Error("Traversal should end with no granted combo after the sink stack");
  }

  const totalBarrierTiles = barrierCombos.reduce((sum, combo) => sum + combo.length, 0);
  return {
    stackCount: barrierCombos.length + 1,
    barrierStackCount: barrierCombos.length,
    uniqueComboCount: generateCombinations().length,
    totalBarrierTiles,
    totalChipCount: barrierCombos.length,
  };
}

function placeStartArea(
  tiles: TileSpecJson[],
  map: Pick<MapJson, "width">,
  startCombo: Combo,
): void {
  setCell(tiles, map, 0, 0, buildCell("FLOOR", { mobTile: "MELINDA", mobDir: "E" }));
  for (let i = 0; i < startCombo.length; i++) {
    setCell(tiles, map, i + 1, 0, buildCell("FLOOR", { itemTool: startCombo[i]! }));
  }
}

function placeBarrierStack(
  tiles: TileSpecJson[],
  map: Pick<MapJson, "width">,
  position: StackPosition,
  barrierCombo: Combo,
  grantedCombo: Combo | null,
): void {
  for (let relY = 0; relY < STACK_HEIGHT; relY++) {
    setCell(tiles, map, position.x, position.y + relY, buildStackFloorCell());
  }

  for (let i = 0; i < barrierCombo.length; i++) {
    setCell(tiles, map, position.x, position.y + i, buildBarrierCell(barrierCombo[i]!));
  }

  setCell(
    tiles,
    map,
    position.x,
    position.y + 4,
    buildCell("TOOL_THIEF", { thinWalls: STACK_WALLS }),
  );
  setCell(
    tiles,
    map,
    position.x,
    position.y + 5,
    buildCell("KEY_THIEF", { thinWalls: STACK_WALLS }),
  );

  if (grantedCombo === null) {
    setCell(tiles, map, position.x, position.y + 9, buildPinkButtonCell());
  } else {
    const firstGrantRow = 10 - grantedCombo.length;
    for (let i = 0; i < grantedCombo.length; i++) {
      const row = firstGrantRow + i;
      const itemTool = grantedCombo[i]!;
      const cell =
        row === 9
          ? buildPinkButtonCell(itemTool)
          : buildCell("FLOOR", { itemTool, thinWalls: STACK_WALLS });
      setCell(tiles, map, position.x, position.y + row, cell);
    }
  }

  setCell(tiles, map, position.x, position.y + 10, buildChipWallCell());
}

function placeFinalStack(
  tiles: TileSpecJson[],
  map: Pick<MapJson, "width">,
  position: StackPosition,
): void {
  for (let relY = 0; relY < STACK_HEIGHT; relY++) {
    const walls = relY === STACK_HEIGHT - 1 ? FINAL_EXIT_WALLS : STACK_WALLS;
    const terrain = relY === 0 ? "CHIP_SOCKET" : relY === STACK_HEIGHT - 1 ? "EXIT" : "FLOOR";
    setCell(tiles, map, position.x, position.y + relY, buildCell(terrain, { thinWalls: walls }));
  }
}

function buildDoc(map: MapJson, seed: number, verification: VerificationSummary): C2mJsonV1 {
  return {
    schema: "c2mTools.c2m.json.v1",
    fileVersion: "7\u0000",
    title: "Procedural Combo Stack Level",
    author: "Codex",
    note: [
      `Generated with fixed seed ${seed}.`,
      `Board ${BOARD_WIDTH}x${BOARD_HEIGHT}.`,
      `${verification.barrierStackCount} barrier stacks plus final socket/exit stack.`,
      `${verification.uniqueComboCount} unique combos; barriers loop in script order until the board is full.`,
    ].join(" "),
    map,
  };
}

export function generateProceduralLevel(seed = DEFAULT_SEED): GeneratedLevel {
  const allCombos = generateCombinations();
  const stackPositions = computeStackPositions();
  const finalStackIndex = stackPositions.length - 1;
  const sinkStackIndex = stackPositions.length - 2;
  const barrierCombos = buildBarrierCombos(finalStackIndex, allCombos);
  const plan = buildTraversalPlan(seed, barrierCombos, sinkStackIndex);
  const verification = verifyTraversalPlan(barrierCombos, plan);

  const mutableMap = createEmptyMap();
  const tiles = [...mutableMap.tiles];

  placeStartArea(tiles, mutableMap, plan.startCombo);

  for (let stackIndex = 0; stackIndex < barrierCombos.length; stackIndex++) {
    placeBarrierStack(
      tiles,
      mutableMap,
      stackPositions[stackIndex]!,
      barrierCombos[stackIndex]!,
      plan.grantsByStack[stackIndex] ?? null,
    );
  }

  placeFinalStack(tiles, mutableMap, stackPositions[finalStackIndex]!);

  const map: MapJson = {
    width: mutableMap.width,
    height: mutableMap.height,
    tiles,
  };

  const doc = buildDoc(map, seed, verification);
  return {
    doc,
    map,
    stackPositions,
    allCombos,
    barrierCombos,
    plan,
    verification,
  };
}

export function summarizeGeneratedLevel(level: GeneratedLevel): string {
  const startCombo = comboKey(level.plan.startCombo);
  return [
    `seed=${level.plan.seed}`,
    `unique_combos=${level.allCombos.length}`,
    `total_stacks=${level.stackPositions.length}`,
    `barrier_stacks=${level.verification.barrierStackCount}`,
    `barrier_tiles=${level.verification.totalBarrierTiles}`,
    `chips=${level.verification.totalChipCount}`,
    `start_combo=${startCombo}`,
  ].join(" ");
}

export function countTerrainTiles(map: MapJson, tileName: string): number {
  let count = 0;
  for (const cell of map.tiles) {
    if (flattenCellLayers(cell).terrain.tile === tileName) count++;
  }
  return count;
}
