import { buildCellFromLayers, flattenCellLayers } from "../src/c2m/cellStack.js";
import type { Dir, MapJson, TileSpecJson } from "../src/c2m/mapCodec.js";
import { createProceduralRegion } from "./ice_maze.js";
import { extractIceMazeGraph, simulateIceRun } from "./ice_maze_graph.js";

export const ISLIDE_BOARD_SIZE = 99;
export const ISLIDE_CENTER = Object.freeze({ x: 49, y: 49 });
export const ISLIDE_ISLAND_MIN = 45;
export const ISLIDE_ISLAND_MAX = 53;
export const ISLIDE_SOCKET_POINT = Object.freeze({ x: 49, y: 31 });
export const ISLIDE_EXIT_POINT = Object.freeze({ x: 98, y: 49 });

export type ISlideGeneratorConfig = Readonly<{
  seed: string;
  chipCount: number;
  branchCount: number;
  loopCount: number;
  sparkleDensity: number;
  routeSpread: number;
  asymmetry: number;
}>;

/** Seed is the sole active control; numeric values describe acceptance targets. */
export const DEFAULT_ISLIDE_GENERATOR_CONFIG: ISlideGeneratorConfig = Object.freeze({
  seed: "i-slide-99",
  chipCount: 96,
  branchCount: 8,
  loopCount: 2,
  sparkleDensity: 100,
  routeSpread: 100,
  asymmetry: 0,
});

export type ISlidePoint = Readonly<{ x: number; y: number }>;
export type ISlideNodeRole = "start" | "hub" | "chip" | "socket" | "exit";
export type ISlideGraphNode = Readonly<{
  id: string;
  point: ISlidePoint;
  role: ISlideNodeRole;
  quadrant?: number;
}>;
export type ISlideGraphEdge = Readonly<{
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: "walk" | "slide";
  entryDir: Dir;
  exitDir: Dir;
  path: ReadonlyArray<ISlidePoint>;
}>;
export type ISlideRouteChain = Readonly<{
  id: string;
  kind: "tail" | "loop";
  quadrant: number;
  nodeIds: ReadonlyArray<string>;
  rootNodeId: string;
  returnNodeId: string;
}>;
export type ISlideGraph = Readonly<{
  nodes: ReadonlyArray<ISlideGraphNode>;
  edges: ReadonlyArray<ISlideGraphEdge>;
  chains: ReadonlyArray<ISlideRouteChain>;
}>;
export type ISlideSolution = Readonly<{
  nodeIds: ReadonlyArray<string>;
  edgeIds: ReadonlyArray<string>;
  collectedChipNodeIds: ReadonlyArray<string>;
}>;
export type ISlideGeneratorMetrics = Readonly<{
  completeCornerGroups: number;
  cornerTileCount: number;
  quadrantChipCounts: readonly [number, number, number, number];
  quadrantCornerGroupCounts: readonly [number, number, number, number];
  routeCrossings: number;
  routeTileCount: number;
  generationWaveCount: number;
  maxWaveSize: number;
}>;
export type ISlideLayout = Readonly<{
  config: ISlideGeneratorConfig;
  map: MapJson;
  graph: ISlideGraph;
  solution: ISlideSolution;
  metrics: ISlideGeneratorMetrics;
  fingerprint: string;
}>;

type ChainPort = Readonly<{ rootPoint: ISlidePoint; outwardDir: Dir; quadrant: number }>;
type SparkleGroup = Readonly<{
  id: string;
  origin: ISlidePoint;
  cells: ReadonlyArray<Readonly<{ point: ISlidePoint; tile: string }>>;
}>;
type SemanticStop = Readonly<{
  id: string;
  point: ISlidePoint;
  role: ISlideNodeRole;
  branch?: number;
  acceptedOrdinal?: number;
}>;
type DirectedPhysicalRoute = Readonly<{
  fromId: string;
  toId: string;
  entryDir: Dir;
  exitDir: Dir;
  path: ReadonlyArray<ISlidePoint>;
  groupIds: ReadonlyArray<string>;
}>;
type SemanticGraphAudit = Readonly<{
  valid: boolean;
  reasons: ReadonlyArray<string>;
  routes: ReadonlyArray<DirectedPhysicalRoute>;
  usedGroupIds: ReadonlySet<string>;
}>;
type WaveCandidate = Readonly<{
  sourceId: string;
  branch: number;
  point: ISlidePoint;
  entryDir: Dir;
  path: ReadonlyArray<ISlidePoint>;
  affectedPointKeys: ReadonlySet<string>;
  affectedRayIds: ReadonlySet<string>;
  outgoingPointKeys: ReadonlySet<string>;
  newGroupIds: ReadonlySet<string>;
  newGroupCount: number;
  score: number;
  tieBreaker: number;
}>;
type GeneratedAttempt = Readonly<{
  map: MapJson;
  groups: ReadonlyArray<SparkleGroup>;
  stops: ReadonlyArray<SemanticStop>;
  routes: ReadonlyArray<DirectedPhysicalRoute>;
  waveSizes: ReadonlyArray<number>;
}>;

const DIRECTIONS: ReadonlyArray<Dir> = Object.freeze(["N", "E", "S", "W"]);
const CORNER_TILE_BY_TURN: Readonly<Record<string, string>> = Object.freeze({
  "E>S": "ICE_CORNER_NE",
  "E>N": "ICE_CORNER_SE",
  "W>S": "ICE_CORNER_NW",
  "W>N": "ICE_CORNER_SW",
  "N>E": "ICE_CORNER_NW",
  "N>W": "ICE_CORNER_NE",
  "S>E": "ICE_CORNER_SW",
  "S>W": "ICE_CORNER_SE",
});
const INWARD_SPARKLE_PATTERN = Object.freeze([
  { dx: 0, dy: 0, tile: "ICE_CORNER_SE" },
  { dx: 1, dy: 0, tile: "ICE_CORNER_SW" },
  { dx: 0, dy: 1, tile: "ICE_CORNER_NE" },
  { dx: 1, dy: 1, tile: "ICE_CORNER_NW" },
] as const);
const CORNER_OFFSET_IN_SPARKLE: Readonly<Record<string, Readonly<{ x: number; y: number }>>> =
  Object.freeze({
    ICE_CORNER_SE: { x: 0, y: 0 },
    ICE_CORNER_SW: { x: 1, y: 0 },
    ICE_CORNER_NE: { x: 0, y: 1 },
    ICE_CORNER_NW: { x: 1, y: 1 },
  });
const SOCKET_SPLIT_SPARKLE_TILES: ReadonlyArray<
  Readonly<{ point: ISlidePoint; tile: TileSpecJson }>
> = Object.freeze([
  { point: { x: 48, y: 31 }, tile: "ICE_CORNER_SE" },
  { point: { x: 50, y: 31 }, tile: "ICE_CORNER_SW" },
  { point: { x: 48, y: 32 }, tile: "ICE_CORNER_NE" },
  { point: { x: 49, y: 32 }, tile: "ICE" },
  { point: { x: 50, y: 32 }, tile: "ICE_CORNER_NW" },
]);
const CHAIN_PORTS: ReadonlyArray<ChainPort> = Object.freeze([
  { rootPoint: { x: 47, y: 45 }, outwardDir: "N", quadrant: 0 },
  { rootPoint: { x: 51, y: 45 }, outwardDir: "N", quadrant: 1 },
  { rootPoint: { x: 47, y: 53 }, outwardDir: "S", quadrant: 2 },
  { rootPoint: { x: 51, y: 53 }, outwardDir: "S", quadrant: 3 },
  { rootPoint: { x: 53, y: 51 }, outwardDir: "E", quadrant: 3 },
  { rootPoint: { x: 45, y: 47 }, outwardDir: "W", quadrant: 0 },
  { rootPoint: { x: 45, y: 51 }, outwardDir: "W", quadrant: 2 },
  { rootPoint: { x: 53, y: 47 }, outwardDir: "E", quadrant: 1 },
]);
const FINAL_SOCKET_PATH = Object.freeze(
  buildWaypointPath({ x: 49, y: 45 }, [
    { x: 49, y: 40 },
    { x: 40, y: 40 },
    { x: 40, y: 37 },
    { x: 49, y: 37 },
    ISLIDE_SOCKET_POINT,
  ]),
);
const FINAL_EXIT_PATH = Object.freeze(
  buildWaypointPath(ISLIDE_SOCKET_POINT, [
    { x: 49, y: 3 },
    { x: 95, y: 3 },
    { x: 95, y: 49 },
    ISLIDE_EXIT_POINT,
  ]),
);
const TARGET_FIELD_GROUPS = 210;
const MIN_RETAINED_GROUPS = 190;
const MIN_CHIPS = 88;
const SOFT_CHIP_TARGET = 96;
const MAX_CHIPS = 124;
const MAX_FIELD_ATTEMPTS = 2;
const MAX_WAVES = 24;
const layoutCache = new Map<string, ISlideLayout>();
const generationDiagnostics: string[] = [];

function normalizeConfig(input: ISlideGeneratorConfig): ISlideGeneratorConfig {
  return { ...DEFAULT_ISLIDE_GENERATOR_CONFIG, seed: String(input.seed) };
}

function hashString32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRandom(seed: string, stream: string): () => number {
  let state = hashString32(`${seed}\u0000${stream}`);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(values: T[], nextRandom: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    const value = values[index]!;
    values[index] = values[swapIndex]!;
    values[swapIndex] = value;
  }
}

function pointKey(point: ISlidePoint): string {
  return `${point.x},${point.y}`;
}

function samePoint(left: ISlidePoint | undefined, right: ISlidePoint): boolean {
  return left !== undefined && left.x === right.x && left.y === right.y;
}

function directionBetween(from: ISlidePoint, to: ISlidePoint): Dir {
  if (to.x === from.x && to.y === from.y - 1) return "N";
  if (to.x === from.x + 1 && to.y === from.y) return "E";
  if (to.x === from.x && to.y === from.y + 1) return "S";
  if (to.x === from.x - 1 && to.y === from.y) return "W";
  throw new Error(`Points (${from.x},${from.y}) and (${to.x},${to.y}) are not adjacent`);
}

function oppositeDirection(dir: Dir): Dir {
  return DIRECTIONS[(DIRECTIONS.indexOf(dir) + 2) % 4]!;
}

function movePoint(point: ISlidePoint, dir: Dir, distance = 1): ISlidePoint {
  if (dir === "N") return { x: point.x, y: point.y - distance };
  if (dir === "E") return { x: point.x + distance, y: point.y };
  if (dir === "S") return { x: point.x, y: point.y + distance };
  return { x: point.x - distance, y: point.y };
}

function appendAxisRun(path: ISlidePoint[], cursor: ISlidePoint, target: ISlidePoint): ISlidePoint {
  let x = cursor.x;
  let y = cursor.y;
  while (x !== target.x || y !== target.y) {
    if (x !== target.x) x += Math.sign(target.x - x);
    else y += Math.sign(target.y - y);
    path.push({ x, y });
  }
  return { x, y };
}

function buildWaypointPath(
  from: ISlidePoint,
  waypoints: ReadonlyArray<ISlidePoint>,
): ISlidePoint[] {
  const path: ISlidePoint[] = [];
  let cursor = from;
  for (const waypoint of waypoints) cursor = appendAxisRun(path, cursor, waypoint);
  return path;
}

function makeGraphEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  from: ISlidePoint,
  path: ReadonlyArray<ISlidePoint>,
  kind: "walk" | "slide",
): ISlideGraphEdge {
  if (path.length === 0) throw new Error(`Edge ${id} has no path`);
  const beforeLast = path.length === 1 ? from : path[path.length - 2]!;
  return {
    id,
    fromNodeId,
    toNodeId,
    kind,
    entryDir: directionBetween(from, path[0]!),
    exitDir: directionBetween(beforeLast, path[path.length - 1]!),
    path: path.map((point) => ({ ...point })),
  };
}

function hubNodeId(point: ISlidePoint): string {
  return `hub-${point.x}-${point.y}`;
}

function buildHubNodes(): ISlideGraphNode[] {
  const nodes: ISlideGraphNode[] = [];
  for (let y = ISLIDE_ISLAND_MIN; y <= ISLIDE_ISLAND_MAX; y += 1) {
    for (let x = ISLIDE_ISLAND_MIN; x <= ISLIDE_ISLAND_MAX; x += 1) {
      nodes.push({
        id: hubNodeId({ x, y }),
        point: { x, y },
        role: x === 49 && y === 49 ? "start" : "hub",
      });
    }
  }
  return nodes;
}

function buildHubEdges(): ISlideGraphEdge[] {
  const edges: ISlideGraphEdge[] = [];
  for (let y = ISLIDE_ISLAND_MIN; y <= ISLIDE_ISLAND_MAX; y += 1) {
    for (let x = ISLIDE_ISLAND_MIN; x <= ISLIDE_ISLAND_MAX; x += 1) {
      const from = { x, y };
      for (const to of [
        { x: x + 1, y },
        { x, y: y + 1 },
      ]) {
        if (to.x > ISLIDE_ISLAND_MAX || to.y > ISLIDE_ISLAND_MAX) continue;
        edges.push(
          makeGraphEdge(
            `walk-${x}-${y}-${to.x}-${to.y}`,
            hubNodeId(from),
            hubNodeId(to),
            from,
            [to],
            "walk",
          ),
        );
      }
    }
  }
  return edges;
}

function makeSparkle(origin: ISlidePoint): SparkleGroup {
  return {
    id: `sparkle-${origin.x}-${origin.y}`,
    origin,
    cells: INWARD_SPARKLE_PATTERN.map(({ dx, dy, tile }) => ({
      point: { x: origin.x + dx, y: origin.y + dy },
      tile,
    })),
  };
}

function turnsInPath(
  from: ISlidePoint,
  path: ReadonlyArray<ISlidePoint>,
): ReadonlyArray<Readonly<{ point: ISlidePoint; tile: string }>> {
  const points = [from, ...path];
  const turns: Array<{ point: ISlidePoint; tile: string }> = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const incoming = directionBetween(points[index - 1]!, points[index]!);
    const outgoing = directionBetween(points[index]!, points[index + 1]!);
    if (incoming === outgoing) continue;
    const tile = CORNER_TILE_BY_TURN[`${incoming}>${outgoing}`];
    if (tile === undefined) throw new Error(`Unsupported turn ${incoming}>${outgoing}`);
    turns.push({ point: points[index]!, tile });
  }
  return turns;
}

function sparkleForTurn(point: ISlidePoint, tile: string): SparkleGroup {
  const offset = CORNER_OFFSET_IN_SPARKLE[tile]!;
  return makeSparkle({ x: point.x - offset.x, y: point.y - offset.y });
}

function distanceSquared(left: ISlidePoint, right: ISlidePoint): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function pathPointKeys(from: ISlidePoint, path: ReadonlyArray<ISlidePoint>): Set<string> {
  return new Set([from, ...path].map(pointKey));
}

function buildSparkleField(
  seed: string,
  attempt: number,
): Readonly<{
  groups: ReadonlyArray<SparkleGroup>;
  protectedPathKeys: ReadonlySet<string>;
}> {
  const groups: SparkleGroup[] = [];
  const occupied = new Map<string, string>();
  const protectedPathKeys = new Set<string>();
  const immutableKeys = new Set<string>();
  for (let y = ISLIDE_ISLAND_MIN; y <= ISLIDE_ISLAND_MAX; y += 1) {
    for (let x = ISLIDE_ISLAND_MIN; x <= ISLIDE_ISLAND_MAX; x += 1) immutableKeys.add(`${x},${y}`);
  }
  immutableKeys.add(pointKey(ISLIDE_SOCKET_POINT));
  immutableKeys.add(pointKey(ISLIDE_EXIT_POINT));
  for (const split of SOCKET_SPLIT_SPARKLE_TILES) immutableKeys.add(pointKey(split.point));

  const canPlace = (group: SparkleGroup, requireSpacing: boolean): boolean => {
    if (
      group.cells.some(
        (cell) =>
          cell.point.x <= 0 ||
          cell.point.y <= 0 ||
          cell.point.x >= 98 ||
          cell.point.y >= 98 ||
          occupied.has(pointKey(cell.point)) ||
          immutableKeys.has(pointKey(cell.point)),
      )
    ) {
      return false;
    }
    return (
      !requireSpacing ||
      groups.every((candidate) => distanceSquared(candidate.origin, group.origin) >= 8)
    );
  };
  const place = (group: SparkleGroup): void => {
    groups.push(group);
    for (const cell of group.cells) occupied.set(pointKey(cell.point), group.id);
  };

  const addRequiredPath = (from: ISlidePoint, path: ReadonlyArray<ISlidePoint>): void => {
    const activeByKey = new Map(
      turnsInPath(from, path).map((turn) => [pointKey(turn.point), turn.tile]),
    );
    for (const turn of turnsInPath(from, path)) {
      const group = sparkleForTurn(turn.point, turn.tile);
      if (!groups.some((candidate) => candidate.id === group.id)) {
        if (!canPlace(group, false)) throw new Error(`Required ${group.id} cannot be placed`);
        place(group);
      }
    }
    for (const point of [from, ...path]) {
      const key = pointKey(point);
      const owner = occupied.get(key);
      if (owner !== undefined) {
        const cell = groups
          .flatMap((group) => group.cells)
          .find((candidate) => samePoint(candidate.point, point));
        if (cell === undefined || activeByKey.get(key) !== cell.tile) {
          throw new Error(`Required path crosses inactive ${owner} at ${key}`);
        }
      }
      protectedPathKeys.add(key);
    }
  };

  addRequiredPath({ x: 49, y: 45 }, FINAL_SOCKET_PATH);
  addRequiredPath(ISLIDE_SOCKET_POINT, FINAL_EXIT_PATH);

  const nextRandom = createRandom(seed, `field-${attempt}-launch`);
  for (let branch = 0; branch < CHAIN_PORTS.length; branch += 1) {
    const port = CHAIN_PORTS[branch]!;
    const perpendicular: Dir =
      port.outwardDir === "N" || port.outwardDir === "S"
        ? port.quadrant % 2 === 0
          ? "W"
          : "E"
        : port.quadrant < 2
          ? "N"
          : "S";
    const distances = [4, 5, 6, 7, 8, 9, 10, 11];
    shuffleInPlace(distances, nextRandom);
    let placed = false;
    for (const distance of distances) {
      const bend = movePoint(port.rootPoint, port.outwardDir, distance);
      const path = buildWaypointPath(port.rootPoint, [bend, movePoint(bend, perpendicular)]);
      const turn = turnsInPath(port.rootPoint, path)[0]!;
      const group = sparkleForTurn(turn.point, turn.tile);
      const pathKeys = pathPointKeys(port.rootPoint, path);
      const pathCrossesExistingCorner = [...pathKeys].some(
        (key) => occupied.has(key) && key !== pointKey(turn.point),
      );
      if (pathCrossesExistingCorner || !canPlace(group, false)) continue;
      const inactiveCollision = group.cells.some(
        (cell) => protectedPathKeys.has(pointKey(cell.point)) && !samePoint(cell.point, turn.point),
      );
      if (inactiveCollision) continue;
      place(group);
      for (const key of pathKeys) protectedPathKeys.add(key);
      placed = true;
      break;
    }
    if (!placed) throw new Error(`No launch sparkle for branch ${branch}`);
  }

  // One seeded sample per stratum gives source-like even coverage without a lattice.
  const strata: Array<{ gx: number; gy: number }> = [];
  for (let gy = 0; gy < 15; gy += 1) {
    for (let gx = 0; gx < 15; gx += 1) strata.push({ gx, gy });
  }
  shuffleInPlace(strata, createRandom(seed, `field-${attempt}-strata-order`));
  const jitter = createRandom(seed, `field-${attempt}-strata-jitter`);
  const candidates: ISlidePoint[] = [];
  for (const { gx, gy } of strata) {
    const minX = 1 + Math.floor((gx * 96) / 15);
    const maxX = Math.min(96, Math.floor(((gx + 1) * 96) / 15));
    const minY = 1 + Math.floor((gy * 96) / 15);
    const maxY = Math.min(96, Math.floor(((gy + 1) * 96) / 15));
    candidates.push({
      x: minX + Math.floor(jitter() * Math.max(1, maxX - minX)),
      y: minY + Math.floor(jitter() * Math.max(1, maxY - minY)),
    });
  }
  const fallback: ISlidePoint[] = [];
  for (let y = 1; y <= 96; y += 1) {
    for (let x = 1; x <= 96; x += 1) fallback.push({ x, y });
  }
  shuffleInPlace(fallback, createRandom(seed, `field-${attempt}-fallback`));
  candidates.push(...fallback);

  for (const origin of candidates) {
    if (groups.length >= TARGET_FIELD_GROUPS) break;
    const group = makeSparkle(origin);
    if (!canPlace(group, true)) continue;
    if (
      group.cells.some(
        (cell) =>
          protectedPathKeys.has(pointKey(cell.point)) || immutableKeys.has(pointKey(cell.point)),
      )
    ) {
      continue;
    }
    place(group);
  }
  if (groups.length !== TARGET_FIELD_GROUPS) {
    throw new Error(`Field attempt ${attempt} placed only ${groups.length} sparkles`);
  }
  return { groups, protectedPathKeys };
}

const FULL_BOARD_REGION = createProceduralRegion({
  board: { width: 99, height: 99 },
  mask: { kind: "rect", rect: { x: 0, y: 0, width: 99, height: 99 } },
});

function makeChipCell(): TileSpecJson {
  return buildCellFromLayers({ terrain: { tile: "FLOOR" }, item: { tile: "IC_CHIP" } });
}

function makePlayerCell(): TileSpecJson {
  return buildCellFromLayers({ terrain: { tile: "FLOOR" }, mob: { tile: "CHIP", dir: "N" } });
}

function setTile(tiles: TileSpecJson[], point: ISlidePoint, tile: TileSpecJson): void {
  tiles[point.y * 99 + point.x] = tile;
}

function terrainAt(map: MapJson, point: ISlidePoint): string {
  return flattenCellLayers(map.tiles[point.y * map.width + point.x]!).terrain.tile;
}

function materializeSparkleFirstMap(groups: ReadonlyArray<SparkleGroup>): MapJson {
  const tiles = Array<TileSpecJson>(99 * 99).fill("ICE");
  for (let coordinate = 0; coordinate < 99; coordinate += 1) {
    setTile(tiles, { x: coordinate, y: 0 }, "WALL");
    setTile(tiles, { x: coordinate, y: 98 }, "WALL");
    setTile(tiles, { x: 0, y: coordinate }, "WALL");
    setTile(tiles, { x: 98, y: coordinate }, "WALL");
  }

  // This is intentionally first: no stop or landmark influenced the scattered field.
  for (const group of groups) {
    for (const cell of group.cells) setTile(tiles, cell.point, cell.tile);
  }

  // Fixed landmarks are layered only after the entire field exists.
  for (const split of SOCKET_SPLIT_SPARKLE_TILES) setTile(tiles, split.point, split.tile);
  for (let y = ISLIDE_ISLAND_MIN; y <= ISLIDE_ISLAND_MAX; y += 1) {
    for (let x = ISLIDE_ISLAND_MIN; x <= ISLIDE_ISLAND_MAX; x += 1) {
      setTile(tiles, { x, y }, "FLOOR");
    }
  }
  setTile(tiles, { x: 49, y: 47 }, "CLUE");
  setTile(tiles, ISLIDE_CENTER, makePlayerCell());
  setTile(tiles, ISLIDE_SOCKET_POINT, "CHIP_SOCKET");
  setTile(tiles, ISLIDE_EXIT_POINT, "EXIT");
  return { width: 99, height: 99, tiles };
}

function buildInitialStops(): SemanticStop[] {
  return [
    ...buildHubNodes().map((node) => ({ id: node.id, point: node.point, role: node.role })),
    { id: "socket", point: ISLIDE_SOCKET_POINT, role: "socket" as const },
    { id: "exit", point: ISLIDE_EXIT_POINT, role: "exit" as const },
  ];
}

function pointsEqual(left: ReadonlyArray<ISlidePoint>, right: ReadonlyArray<ISlidePoint>): boolean {
  return (
    left.length === right.length && left.every((point, index) => samePoint(right[index], point))
  );
}

function buildGroupIdByCorner(groups: ReadonlyArray<SparkleGroup>): ReadonlyMap<string, string> {
  return new Map(
    groups.flatMap((group) => group.cells.map((cell) => [pointKey(cell.point), group.id])),
  );
}

function routeKey(
  route: Pick<DirectedPhysicalRoute, "fromId" | "toId" | "entryDir" | "path">,
): string {
  return `${route.fromId}/${route.entryDir}>${route.toId}/${route.path.map(pointKey).join(";")}`;
}

function auditSemanticGraph(
  map: MapJson,
  stops: ReadonlyArray<SemanticStop>,
  groups: ReadonlyArray<SparkleGroup>,
): SemanticGraphAudit {
  const stopByPoint = new Map(stops.map((stop) => [pointKey(stop.point), stop]));
  const groupIdByCorner = buildGroupIdByCorner(groups);
  const routes: DirectedPhysicalRoute[] = [];
  const reasons: string[] = [];
  const usedGroupIds = new Set<string>();

  for (const stop of stops) {
    for (const dir of DIRECTIONS) {
      const run = simulateIceRun(map, FULL_BOARD_REGION, stop.point, dir, {
        chipSocketsOpen: true,
      });
      if (
        run.termination !== "stopped" ||
        !run.encounteredSliding ||
        run.stopPoint === undefined ||
        run.stopDir === undefined
      ) {
        continue;
      }
      const target = stopByPoint.get(pointKey(run.stopPoint));
      if (target === undefined) continue;
      if (target.id === stop.id) {
        reasons.push(`self-loop semantic ray ${stop.id}/${dir}`);
        continue;
      }
      const turns = turnsInPath(stop.point, run.path);
      const groupIds = turns.flatMap((turn) => {
        const groupId = groupIdByCorner.get(pointKey(turn.point));
        return groupId === undefined ? [] : [groupId];
      });
      if (groupIds.length === 0) {
        reasons.push(`straight semantic ray ${stop.id}/${dir}>${target.id}`);
      }
      if (groupIds.length !== turns.length) {
        reasons.push(`route ${stop.id}/${dir}>${target.id} uses a non-ordinary corner`);
      }
      for (const groupId of groupIds) usedGroupIds.add(groupId);
      routes.push({
        fromId: stop.id,
        toId: target.id,
        entryDir: dir,
        exitDir: run.stopDir,
        path: run.path,
        groupIds,
      });
    }
  }

  const routeKeys = new Set(routes.map(routeKey));
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  for (const route of routes) {
    const from = stopById.get(route.fromId)!;
    const reversePath = [from.point, ...route.path.slice(0, -1)].reverse();
    const reverse: DirectedPhysicalRoute = {
      fromId: route.toId,
      toId: route.fromId,
      entryDir: oppositeDirection(route.exitDir),
      exitDir: oppositeDirection(route.entryDir),
      path: reversePath,
      groupIds: [...route.groupIds].reverse(),
    };
    if (!routeKeys.has(routeKey(reverse))) {
      reasons.push(`nonreciprocal semantic ray ${route.fromId}/${route.entryDir}>${route.toId}`);
    }
  }

  const allowedSocketNeighborIds = new Set([hubNodeId({ x: 49, y: 45 }), "exit"]);
  for (const route of routes) {
    if (
      (route.fromId === "exit" && route.toId !== "socket") ||
      (route.toId === "exit" && route.fromId !== "socket")
    ) {
      reasons.push(`exit has undeclared neighbor ${route.fromId}>${route.toId}`);
    }
    if (
      (route.fromId === "socket" && !allowedSocketNeighborIds.has(route.toId)) ||
      (route.toId === "socket" && !allowedSocketNeighborIds.has(route.fromId))
    ) {
      reasons.push(`socket has undeclared neighbor ${route.fromId}>${route.toId}`);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const route of routes) {
    const values = adjacency.get(route.fromId) ?? new Set<string>();
    values.add(route.toId);
    adjacency.set(route.fromId, values);
  }
  const reachable = new Set(
    stops.filter((stop) => stop.role === "hub" || stop.role === "start").map((stop) => stop.id),
  );
  const queue = [...reachable];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (neighbor === "socket" || neighbor === "exit" || reachable.has(neighbor)) continue;
      reachable.add(neighbor);
      queue.push(neighbor);
    }
  }
  for (const stop of stops) {
    if (stop.role === "chip" && !reachable.has(stop.id))
      reasons.push(`unreachable chip ${stop.id}`);
  }

  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    routes,
    usedGroupIds,
  };
}

function candidateSources(stops: ReadonlyArray<SemanticStop>): ReadonlyArray<SemanticStop> {
  const branchByRoot = new Map(CHAIN_PORTS.map((port, index) => [pointKey(port.rootPoint), index]));
  return stops.flatMap((stop) => {
    if (stop.role === "chip") return [stop];
    const branch = branchByRoot.get(pointKey(stop.point));
    return branch === undefined ? [] : [{ ...stop, branch }];
  });
}

function minimumStopDistanceSquared(
  point: ISlidePoint,
  stops: ReadonlyArray<SemanticStop>,
): number {
  return Math.min(...stops.map((stop) => distanceSquared(point, stop.point)));
}

function requiredNewGroupCount(chipCount: number, currentlyUsedGroupCount: number): number {
  return Math.max(
    1,
    Math.min(
      3,
      Math.ceil(
        Math.max(0, MIN_RETAINED_GROUPS - currentlyUsedGroupCount) /
          Math.max(1, SOFT_CHIP_TARGET - chipCount),
      ),
    ),
  );
}

function generateWaveCandidates(
  seed: string,
  waveIndex: number,
  map: MapJson,
  stops: ReadonlyArray<SemanticStop>,
  groups: ReadonlyArray<SparkleGroup>,
  protectedPathKeys: ReadonlySet<string>,
  currentlyUsedGroupIds: ReadonlySet<string>,
): WaveCandidate[] {
  const stopPointKeys = new Set(stops.map((stop) => pointKey(stop.point)));
  const groupIdByCorner = buildGroupIdByCorner(groups);
  const chipCount = stops.filter((stop) => stop.role === "chip").length;
  const neededNewGroups = requiredNewGroupCount(chipCount, currentlyUsedGroupIds.size);
  const candidates: WaveCandidate[] = [];
  const affectedRayIdsByPoint = new Map<string, Set<string>>();
  const frozenSemanticRayIds = new Set<string>();
  for (const stop of stops) {
    for (const dir of DIRECTIONS) {
      const rayId = `${stop.id}/${dir}`;
      const run = simulateIceRun(map, FULL_BOARD_REGION, stop.point, dir, {
        chipSocketsOpen: true,
      });
      if (
        run.termination === "stopped" &&
        run.encounteredSliding &&
        run.stopPoint !== undefined &&
        stopPointKeys.has(pointKey(run.stopPoint)) &&
        !samePoint(run.stopPoint, stop.point)
      ) {
        frozenSemanticRayIds.add(rayId);
      }
      for (const point of run.path) {
        const values = affectedRayIdsByPoint.get(pointKey(point)) ?? new Set<string>();
        values.add(rayId);
        affectedRayIdsByPoint.set(pointKey(point), values);
      }
    }
  }

  for (const source of candidateSources(stops)) {
    const branch = source.branch!;
    for (const dir of DIRECTIONS) {
      const run = simulateIceRun(map, FULL_BOARD_REGION, source.point, dir, {
        chipSocketsOpen: true,
      });
      if (!run.encounteredSliding || run.path.length < 4) continue;
      if (run.stopPoint !== undefined && stopPointKeys.has(pointKey(run.stopPoint))) continue;

      const eligible: Array<{
        point: ISlidePoint;
        path: ReadonlyArray<ISlidePoint>;
        groupIds: ReadonlyArray<string>;
      }> = [];
      for (let pathIndex = 2; pathIndex < run.path.length; pathIndex += 1) {
        const point = run.path[pathIndex]!;
        const key = pointKey(point);
        if (
          terrainAt(map, point) !== "ICE" ||
          protectedPathKeys.has(key) ||
          stopPointKeys.has(key) ||
          point.x <= 1 ||
          point.y <= 1 ||
          point.x >= 97 ||
          point.y >= 97 ||
          minimumStopDistanceSquared(point, stops) < 9
        ) {
          continue;
        }
        const prefix = run.path.slice(0, pathIndex + 1);
        const affectedRayIds = affectedRayIdsByPoint.get(key) ?? new Set<string>();
        if ([...affectedRayIds].some((rayId) => frozenSemanticRayIds.has(rayId))) continue;
        const turns = turnsInPath(source.point, prefix);
        const groupIds = turns.flatMap((turn) => {
          const groupId = groupIdByCorner.get(pointKey(turn.point));
          return groupId === undefined ? [] : [groupId];
        });
        if (groupIds.length < 1 || groupIds.length !== turns.length) continue;
        eligible.push({ point, path: prefix, groupIds });
      }
      if (eligible.length === 0) continue;

      // Spend the remaining chip budget at the rate needed to route-own the field.
      // Within a ray, the shortest prefix meeting that rate preserves the most
      // downstream candidate stops. A lower-coverage prefix remains a fallback.
      eligible.sort((left, right) => {
        const leftNew = new Set(left.groupIds.filter((id) => !currentlyUsedGroupIds.has(id))).size;
        const rightNew = new Set(right.groupIds.filter((id) => !currentlyUsedGroupIds.has(id)))
          .size;
        const leftMeetsTarget = leftNew >= neededNewGroups;
        const rightMeetsTarget = rightNew >= neededNewGroups;
        if (leftMeetsTarget !== rightMeetsTarget) return leftMeetsTarget ? -1 : 1;
        if (!leftMeetsTarget && leftNew !== rightNew) return rightNew - leftNew;
        if (left.path.length !== right.path.length) return left.path.length - right.path.length;
        if (leftNew !== rightNew) return rightNew - leftNew;
        return pointKey(left.point).localeCompare(pointKey(right.point));
      });
      const chosen = eligible[0]!;
      const newGroupIds = new Set(
        chosen.groupIds.filter((groupId) => !currentlyUsedGroupIds.has(groupId)),
      );
      const newGroupCount = newGroupIds.size;
      setTile(map.tiles as TileSpecJson[], chosen.point, makeChipCell());
      const outgoingPointKeys = new Set<string>();
      for (const outgoingDir of DIRECTIONS) {
        const outgoing = simulateIceRun(map, FULL_BOARD_REGION, chosen.point, outgoingDir, {
          chipSocketsOpen: true,
        });
        for (const point of outgoing.path) outgoingPointKeys.add(pointKey(point));
      }
      setTile(map.tiles as TileSpecJson[], chosen.point, "ICE");
      candidates.push({
        sourceId: source.id,
        branch,
        point: chosen.point,
        entryDir: dir,
        path: chosen.path,
        affectedPointKeys: pathPointKeys(source.point, chosen.path),
        affectedRayIds: affectedRayIdsByPoint.get(pointKey(chosen.point)) ?? new Set<string>(),
        outgoingPointKeys,
        newGroupIds,
        newGroupCount,
        score: chosen.path.length - newGroupCount * 10_000,
        tieBreaker: hashString32(
          `${seed}/${waveIndex}/${source.id}/${dir}/${pointKey(chosen.point)}`,
        ),
      });
    }
  }
  return candidates.sort(
    (left, right) => left.score - right.score || left.tieBreaker - right.tieBreaker,
  );
}

function auditWithExhaustiveExtraction(
  map: MapJson,
  stops: ReadonlyArray<SemanticStop>,
  groups: ReadonlyArray<SparkleGroup>,
  directAudit: SemanticGraphAudit,
): boolean {
  if (!directAudit.valid) return false;
  const extracted = extractIceMazeGraph(map, FULL_BOARD_REGION, { chipSocketsOpen: true });
  const extractedNodeById = new Map(extracted.nodes.map((node) => [node.id, node]));
  const stopByPoint = new Map(stops.map((stop) => [pointKey(stop.point), stop]));
  const groupIdByCorner = buildGroupIdByCorner(groups);
  const extractedRouteKeys = new Set<string>();

  for (const edge of extracted.edges) {
    const fromPoint = extractedNodeById.get(edge.fromNodeId)!.point;
    const toPoint = extractedNodeById.get(edge.toNodeId)!.point;
    const from = stopByPoint.get(pointKey(fromPoint));
    const to = stopByPoint.get(pointKey(toPoint));
    if (from === undefined || to === undefined || from.id === to.id) continue;
    const turns = turnsInPath(fromPoint, edge.path);
    const groupIds = turns.flatMap((turn) => {
      const groupId = groupIdByCorner.get(pointKey(turn.point));
      return groupId === undefined ? [] : [groupId];
    });
    if (groupIds.length === 0 || groupIds.length !== turns.length) return false;
    extractedRouteKeys.add(
      routeKey({
        fromId: from.id,
        toId: to.id,
        entryDir: edge.entryDir,
        path: edge.path,
      }),
    );
  }
  return (
    extractedRouteKeys.size === directAudit.routes.length &&
    directAudit.routes.every((route) => extractedRouteKeys.has(routeKey(route)))
  );
}

function roundRobinCandidates(candidates: ReadonlyArray<WaveCandidate>): WaveCandidate[] {
  const byBranch = new Map<number, WaveCandidate[]>();
  for (const candidate of candidates) {
    const values = byBranch.get(candidate.branch) ?? [];
    values.push(candidate);
    byBranch.set(candidate.branch, values);
  }
  const ordered: WaveCandidate[] = [];
  let depth = 0;
  while ([...byBranch.values()].some((values) => depth < values.length)) {
    for (let branch = 0; branch < CHAIN_PORTS.length; branch += 1) {
      const candidate = byBranch.get(branch)?.[depth];
      if (candidate !== undefined) ordered.push(candidate);
    }
    depth += 1;
  }
  return ordered;
}

function filterIndividuallyValidCandidates(
  map: MapJson,
  stops: ReadonlyArray<SemanticStop>,
  groups: ReadonlyArray<SparkleGroup>,
  baselineAudit: SemanticGraphAudit,
  candidates: ReadonlyArray<WaveCandidate>,
): WaveCandidate[] {
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const stopByPoint = new Map(stops.map((stop) => [pointKey(stop.point), stop]));
  const groupIdByCorner = buildGroupIdByCorner(groups);
  const frozenSemanticRayIds = new Set(
    baselineAudit.routes.map((route) => `${route.fromId}/${route.entryDir}`),
  );
  const valid: WaveCandidate[] = [];

  const hasOwnedTurn = (from: ISlidePoint, path: ReadonlyArray<ISlidePoint>): boolean => {
    const turns = turnsInPath(from, path);
    return turns.length > 0 && turns.every((turn) => groupIdByCorner.has(pointKey(turn.point)));
  };
  const specialAdjacencyIsAllowed = (from: SemanticStop, to: SemanticStop): boolean => {
    if (from.role === "exit" || to.role === "exit") {
      return from.role === "socket" || to.role === "socket";
    }
    if (from.role === "socket" || to.role === "socket") {
      const other = from.role === "socket" ? to : from;
      return other.id === hubNodeId({ x: 49, y: 45 });
    }
    return true;
  };

  for (let probeIndex = 0; probeIndex < candidates.length && probeIndex < 64; probeIndex += 1) {
    const candidate = candidates[probeIndex]!;
    // Accepted semantic edges are frozen. Splitting one would make route-owned
    // downstream sparkles disappear when a later chip mutates the graph.
    if ([...candidate.affectedRayIds].some((rayId) => frozenSemanticRayIds.has(rayId))) {
      continue;
    }
    const probeId = `candidate-probe-${probeIndex}`;
    const probe: SemanticStop = {
      id: probeId,
      point: candidate.point,
      role: "chip",
      branch: candidate.branch,
    };
    setTile(map.tiles as TileSpecJson[], candidate.point, makeChipCell());

    let candidateIsValid = candidate.affectedRayIds.size > 0;
    let parentRemainsExact = false;
    for (const rayId of candidate.affectedRayIds) {
      if (!candidateIsValid) break;
      const separator = rayId.lastIndexOf("/");
      const source = stopById.get(rayId.slice(0, separator));
      const dir = rayId.slice(separator + 1) as Dir;
      if (source === undefined || !DIRECTIONS.includes(dir)) {
        candidateIsValid = false;
        break;
      }
      const forward = simulateIceRun(map, FULL_BOARD_REGION, source.point, dir, {
        chipSocketsOpen: true,
      });
      if (
        forward.termination !== "stopped" ||
        !forward.encounteredSliding ||
        forward.stopPoint === undefined ||
        forward.stopDir === undefined ||
        !samePoint(forward.stopPoint, probe.point) ||
        !hasOwnedTurn(source.point, forward.path) ||
        !specialAdjacencyIsAllowed(source, probe)
      ) {
        candidateIsValid = false;
        break;
      }
      const reverse = simulateIceRun(
        map,
        FULL_BOARD_REGION,
        probe.point,
        oppositeDirection(forward.stopDir),
        { chipSocketsOpen: true },
      );
      const expectedReversePath = [source.point, ...forward.path.slice(0, -1)].reverse();
      if (
        reverse.termination !== "stopped" ||
        reverse.stopPoint === undefined ||
        !samePoint(reverse.stopPoint, source.point) ||
        !pointsEqual(reverse.path, expectedReversePath)
      ) {
        candidateIsValid = false;
        break;
      }
      if (
        source.id === candidate.sourceId &&
        dir === candidate.entryDir &&
        pointsEqual(forward.path, candidate.path)
      ) {
        parentRemainsExact = true;
      }
    }

    // Only rays containing the new stop can change. Check those above, then the
    // four genuinely new rays from the stop. Everything else remains identical
    // to the valid wave baseline.
    for (const dir of DIRECTIONS) {
      if (!candidateIsValid) break;
      const forward = simulateIceRun(map, FULL_BOARD_REGION, probe.point, dir, {
        chipSocketsOpen: true,
      });
      if (
        forward.termination !== "stopped" ||
        !forward.encounteredSliding ||
        forward.stopPoint === undefined ||
        forward.stopDir === undefined
      ) {
        continue;
      }
      if (samePoint(forward.stopPoint, probe.point)) {
        candidateIsValid = false;
        break;
      }
      const target = stopByPoint.get(pointKey(forward.stopPoint));
      if (target === undefined) continue;
      if (!hasOwnedTurn(probe.point, forward.path) || !specialAdjacencyIsAllowed(probe, target)) {
        candidateIsValid = false;
        break;
      }
      const reverse = simulateIceRun(
        map,
        FULL_BOARD_REGION,
        target.point,
        oppositeDirection(forward.stopDir),
        { chipSocketsOpen: true },
      );
      const expectedReversePath = [probe.point, ...forward.path.slice(0, -1)].reverse();
      if (
        reverse.termination !== "stopped" ||
        reverse.stopPoint === undefined ||
        !samePoint(reverse.stopPoint, probe.point) ||
        !pointsEqual(reverse.path, expectedReversePath)
      ) {
        candidateIsValid = false;
      }
    }

    setTile(map.tiles as TileSpecJson[], candidate.point, "ICE");
    if (candidateIsValid && parentRemainsExact) valid.push(candidate);
    if (valid.length >= 40) break;
  }
  return valid;
}

function tryGenerateAttempt(seed: string, attempt: number): GeneratedAttempt | null {
  const fail = (stage: string): null => {
    generationDiagnostics.push(`${attempt}:${stage}`);
    return null;
  };
  let field: ReturnType<typeof buildSparkleField>;
  try {
    field = buildSparkleField(seed, attempt);
  } catch (error: unknown) {
    return fail(`field:${error instanceof Error ? error.message : String(error)}`);
  }
  const { groups, protectedPathKeys } = field;
  const map = materializeSparkleFirstMap(groups);
  const stops: SemanticStop[] = buildInitialStops();
  let audit = auditSemanticGraph(map, stops, groups);
  if (!audit.valid) return fail(`baseline:${audit.reasons.slice(0, 3).join(",")}`);
  const waveSizes: number[] = [];
  let chipOrdinal = 0;

  for (let waveIndex = 0; waveIndex < MAX_WAVES && chipOrdinal < MAX_CHIPS; waveIndex += 1) {
    const validatedCandidates = roundRobinCandidates(
      filterIndividuallyValidCandidates(
        map,
        stops,
        groups,
        audit,
        generateWaveCandidates(
          seed,
          waveIndex,
          map,
          stops,
          groups,
          protectedPathKeys,
          audit.usedGroupIds,
        ),
      ),
    );
    // Higher-coverage candidates remain first, but lower-coverage expansion
    // stops share the wave so the frontier does not collapse into tiny batches.
    const candidates = validatedCandidates;
    if (candidates.length === 0) break;
    const selected: WaveCandidate[] = [];
    const selectedTargetKeys = new Set<string>();
    const selectedAffectedRayIds = new Set<string>();
    const selectedNewGroupIds = new Set<string>();
    const semanticPointKeys = new Set(stops.map((stop) => pointKey(stop.point)));

    for (const candidate of candidates) {
      if (chipOrdinal + selected.length >= MAX_CHIPS) break;
      const candidateKey = pointKey(candidate.point);
      if (semanticPointKeys.has(candidateKey) || selectedTargetKeys.has(candidateKey)) continue;
      if (
        [...candidate.affectedRayIds].some((rayId) => selectedAffectedRayIds.has(rayId)) ||
        [...candidate.newGroupIds].some((groupId) => selectedNewGroupIds.has(groupId)) ||
        selected.some((prior) => prior.outgoingPointKeys.has(candidateKey)) ||
        [...selectedTargetKeys].some((key) => candidate.outgoingPointKeys.has(key))
      ) {
        continue;
      }
      selected.push(candidate);
      selectedTargetKeys.add(candidateKey);
      for (const rayId of candidate.affectedRayIds) selectedAffectedRayIds.add(rayId);
      for (const groupId of candidate.newGroupIds) selectedNewGroupIds.add(groupId);
    }

    if (selected.length === 0) break;
    const baseStopCount = stops.length;
    let committed = [...selected];
    let committedAudit: SemanticGraphAudit | undefined;
    while (committed.length > 0) {
      for (let index = 0; index < committed.length; index += 1) {
        const candidate = committed[index]!;
        const ordinal = chipOrdinal + index + 1;
        const nodeId = `chip-${String(ordinal).padStart(3, "0")}`;
        setTile(map.tiles as TileSpecJson[], candidate.point, makeChipCell());
        stops.push({
          id: nodeId,
          point: candidate.point,
          role: "chip",
          branch: candidate.branch,
          acceptedOrdinal: ordinal,
        });
      }
      const provisional = auditSemanticGraph(map, stops, groups);
      const parentsRemainExact = committed.every((candidate, index) => {
        const nodeId = `chip-${String(chipOrdinal + index + 1).padStart(3, "0")}`;
        return provisional.routes.some(
          (route) =>
            route.fromId === candidate.sourceId &&
            route.toId === nodeId &&
            route.entryDir === candidate.entryDir &&
            pointsEqual(route.path, candidate.path),
        );
      });
      if (provisional.valid && parentsRemainExact) {
        committedAudit = provisional;
        break;
      }
      stops.splice(baseStopCount);
      for (const candidate of committed)
        setTile(map.tiles as TileSpecJson[], candidate.point, "ICE");
      committed.pop();
    }
    if (committedAudit === undefined || committed.length === 0) break;
    audit = committedAudit;
    chipOrdinal += committed.length;
    waveSizes.push(committed.length);

    const branchCounts = Array<number>(8).fill(0);
    for (const stop of stops) {
      if (stop.role === "chip" && stop.branch !== undefined) {
        branchCounts[stop.branch] = (branchCounts[stop.branch] ?? 0) + 1;
      }
    }
    if (
      chipOrdinal >= SOFT_CHIP_TARGET &&
      audit.usedGroupIds.size >= MIN_RETAINED_GROUPS &&
      branchCounts.every((count) => count >= 6)
    ) {
      break;
    }
  }

  if (chipOrdinal < MIN_CHIPS || audit.usedGroupIds.size < MIN_RETAINED_GROUPS) {
    return fail(
      `growth:chips=${chipOrdinal},groups=${audit.usedGroupIds.size},waves=${waveSizes.join("+")}`,
    );
  }

  // Pruning is simultaneous, followed by a fresh physical extraction. Any field
  // member that survives must be traversed by at least one final semantic route.
  let retainedGroups = groups.filter((group) => audit.usedGroupIds.has(group.id));
  if (retainedGroups.length < MIN_RETAINED_GROUPS) return fail(`retained:${retainedGroups.length}`);
  for (const group of groups) {
    if (audit.usedGroupIds.has(group.id)) continue;
    for (const cell of group.cells) setTile(map.tiles as TileSpecJson[], cell.point, "ICE");
  }
  audit = auditSemanticGraph(map, stops, retainedGroups);
  if (!audit.valid || !auditWithExhaustiveExtraction(map, stops, retainedGroups, audit))
    return fail(`first-prune:${audit.reasons.slice(0, 3).join(",")}`);

  // Removing unused deflectors can change routes, so converge ownership to a fixed point.
  for (let prunePass = 0; prunePass < 4; prunePass += 1) {
    const unused = retainedGroups.filter((group) => !audit.usedGroupIds.has(group.id));
    if (unused.length === 0) break;
    if (retainedGroups.length - unused.length < MIN_RETAINED_GROUPS) {
      return fail(`prune-${prunePass}-count:${retainedGroups.length - unused.length}`);
    }
    for (const group of unused) {
      for (const cell of group.cells) setTile(map.tiles as TileSpecJson[], cell.point, "ICE");
    }
    retainedGroups = retainedGroups.filter((group) => audit.usedGroupIds.has(group.id));
    audit = auditSemanticGraph(map, stops, retainedGroups);
    if (!audit.valid) return fail(`prune-${prunePass}:${audit.reasons.slice(0, 3).join(",")}`);
  }
  if (
    retainedGroups.some((group) => !audit.usedGroupIds.has(group.id)) ||
    !auditWithExhaustiveExtraction(map, stops, retainedGroups, audit)
  ) {
    return fail("final-ownership-or-exhaustive");
  }
  return { map, groups: retainedGroups, stops, routes: audit.routes, waveSizes };
}

function reciprocalRouteKey(
  route: DirectedPhysicalRoute,
  stopById: ReadonlyMap<string, SemanticStop>,
): string {
  const from = stopById.get(route.fromId)!;
  return routeKey({
    fromId: route.toId,
    toId: route.fromId,
    entryDir: oppositeDirection(route.exitDir),
    path: [from.point, ...route.path.slice(0, -1)].reverse(),
  });
}

function buildSlideEdges(
  routes: ReadonlyArray<DirectedPhysicalRoute>,
  stops: ReadonlyArray<SemanticStop>,
): ISlideGraphEdge[] {
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const routeByKey = new Map(routes.map((route) => [routeKey(route), route]));
  const visited = new Set<string>();
  const ordinary: DirectedPhysicalRoute[] = [];
  let finalSocket: DirectedPhysicalRoute | undefined;
  let finalExit: DirectedPhysicalRoute | undefined;

  for (const route of [...routes].sort((left, right) =>
    routeKey(left).localeCompare(routeKey(right)),
  )) {
    const key = routeKey(route);
    if (visited.has(key)) continue;
    const reverseKey = reciprocalRouteKey(route, stopById);
    if (!routeByKey.has(reverseKey)) throw new Error(`Missing reverse for ${key}`);
    visited.add(key);
    visited.add(reverseKey);
    if (
      new Set([route.fromId, route.toId]).has("socket") &&
      new Set([route.fromId, route.toId]).has("exit")
    ) {
      finalExit = route.fromId === "socket" ? route : routeByKey.get(reverseKey)!;
    } else if (
      new Set([route.fromId, route.toId]).has("socket") &&
      new Set([route.fromId, route.toId]).has(hubNodeId({ x: 49, y: 45 }))
    ) {
      finalSocket = route.toId === "socket" ? route : routeByKey.get(reverseKey)!;
    } else {
      ordinary.push(route);
    }
  }
  if (finalSocket === undefined || finalExit === undefined)
    throw new Error("Missing final socket arm");

  const toEdge = (route: DirectedPhysicalRoute, id: string): ISlideGraphEdge => ({
    id,
    fromNodeId: route.fromId,
    toNodeId: route.toId,
    kind: "slide",
    entryDir: route.entryDir,
    exitDir: route.exitDir,
    path: route.path,
  });
  return [
    ...ordinary.map((route, index) =>
      toEdge(route, `slide-physical-${String(index + 1).padStart(3, "0")}`),
    ),
    toEdge(finalSocket, "slide-final-socket"),
    toEdge(finalExit, "slide-final-exit"),
  ];
}

function buildGraphNodes(stops: ReadonlyArray<SemanticStop>): ISlideGraphNode[] {
  return stops.map((stop) => ({
    id: stop.id,
    point: stop.point,
    role: stop.role,
    ...(stop.role === "chip"
      ? {
          quadrant:
            (stop.point.y < ISLIDE_CENTER.y ? 0 : 2) + (stop.point.x < ISLIDE_CENTER.x ? 0 : 1),
        }
      : {}),
  }));
}

function buildChains(seed: string, stops: ReadonlyArray<SemanticStop>): ISlideRouteChain[] {
  const loopBranches = Array.from({ length: 8 }, (_, index) => index);
  shuffleInPlace(loopBranches, createRandom(seed, "loop-branch-labels"));
  const loopBranchSet = new Set(loopBranches.slice(0, DEFAULT_ISLIDE_GENERATOR_CONFIG.loopCount));
  return CHAIN_PORTS.map((port, branch) => ({
    id: `chain-${String(branch + 1).padStart(2, "0")}`,
    kind: loopBranchSet.has(branch) ? "loop" : "tail",
    quadrant: port.quadrant,
    nodeIds: stops
      .filter((stop) => stop.role === "chip" && stop.branch === branch)
      .sort((left, right) => (left.acceptedOrdinal ?? 0) - (right.acceptedOrdinal ?? 0))
      .map((stop) => stop.id),
    rootNodeId: hubNodeId(port.rootPoint),
    returnNodeId: hubNodeId(port.rootPoint),
  }));
}

function edgePairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `${leftId}\u0000${rightId}` : `${rightId}\u0000${leftId}`;
}

function appendHubWalk(
  nodeIds: string[],
  edgeIds: string[],
  walkEdgeByPair: ReadonlyMap<string, string>,
  target: ISlidePoint,
): void {
  const parts = nodeIds.at(-1)!.split("-");
  let x = Number(parts.at(-2));
  let y = Number(parts.at(-1));
  while (x !== target.x || y !== target.y) {
    if (x !== target.x) x += Math.sign(target.x - x);
    else y += Math.sign(target.y - y);
    const nextId = hubNodeId({ x, y });
    const edgeId = walkEdgeByPair.get(edgePairKey(nodeIds.at(-1)!, nextId));
    if (edgeId === undefined) throw new Error(`Missing island walk to ${nextId}`);
    edgeIds.push(edgeId);
    nodeIds.push(nextId);
  }
}

function buildSolution(
  nodes: ReadonlyArray<ISlideGraphNode>,
  walkEdges: ReadonlyArray<ISlideGraphEdge>,
  slideEdges: ReadonlyArray<ISlideGraphEdge>,
): ISlideSolution {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const walkEdgeByPair = new Map(
    walkEdges.map((edge) => [edgePairKey(edge.fromNodeId, edge.toNodeId), edge.id]),
  );
  const adjacency = new Map<string, Array<{ nodeId: string; edgeId: string }>>();
  for (const edge of slideEdges) {
    if (
      edge.fromNodeId === "socket" ||
      edge.toNodeId === "socket" ||
      edge.fromNodeId === "exit" ||
      edge.toNodeId === "exit"
    ) {
      continue;
    }
    const forward = adjacency.get(edge.fromNodeId) ?? [];
    forward.push({ nodeId: edge.toNodeId, edgeId: edge.id });
    adjacency.set(edge.fromNodeId, forward);
    const reverse = adjacency.get(edge.toNodeId) ?? [];
    reverse.push({ nodeId: edge.fromNodeId, edgeId: edge.id });
    adjacency.set(edge.toNodeId, reverse);
  }
  for (const values of adjacency.values()) {
    values.sort(
      (left, right) =>
        left.nodeId.localeCompare(right.nodeId) || left.edgeId.localeCompare(right.edgeId),
    );
  }

  const hubIds = nodes
    .filter((node) => node.role === "hub" || node.role === "start")
    .map((node) => node.id);
  const visited = new Set(hubIds);
  const queue = [...hubIds];
  const children = new Map<string, Array<{ nodeId: string; edgeId: string }>>();
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const neighbor of adjacency.get(parentId) ?? []) {
      if (visited.has(neighbor.nodeId)) continue;
      visited.add(neighbor.nodeId);
      queue.push(neighbor.nodeId);
      const values = children.get(parentId) ?? [];
      values.push(neighbor);
      children.set(parentId, values);
    }
  }
  const chipIds = nodes.filter((node) => node.role === "chip").map((node) => node.id);
  if (chipIds.some((id) => !visited.has(id)))
    throw new Error("Solution spanning tree misses a chip");

  const nodeIds = [hubNodeId(ISLIDE_CENTER)];
  const edgeIds: string[] = [];
  const collectedChipNodeIds: string[] = [];
  const walkSubtree = (parentId: string): void => {
    for (const child of children.get(parentId) ?? []) {
      edgeIds.push(child.edgeId);
      nodeIds.push(child.nodeId);
      if (nodeById.get(child.nodeId)?.role === "chip") collectedChipNodeIds.push(child.nodeId);
      walkSubtree(child.nodeId);
      edgeIds.push(child.edgeId);
      nodeIds.push(parentId);
    }
  };

  const rootIds = hubIds.filter((id) => (children.get(id)?.length ?? 0) > 0).sort();
  for (const rootId of rootIds) {
    appendHubWalk(nodeIds, edgeIds, walkEdgeByPair, nodeById.get(rootId)!.point);
    walkSubtree(rootId);
  }
  if (new Set(collectedChipNodeIds).size !== chipIds.length) {
    throw new Error(`Solution collects ${collectedChipNodeIds.length}/${chipIds.length} chips`);
  }

  appendHubWalk(nodeIds, edgeIds, walkEdgeByPair, { x: 49, y: 45 });
  const socketEdge = slideEdges.find((edge) => edge.id === "slide-final-socket")!;
  const exitEdge = slideEdges.find((edge) => edge.id === "slide-final-exit")!;
  edgeIds.push(socketEdge.id);
  nodeIds.push("socket");
  edgeIds.push(exitEdge.id);
  nodeIds.push("exit");
  return { nodeIds, edgeIds, collectedChipNodeIds };
}

function countRouteCrossings(
  slideEdges: ReadonlyArray<ISlideGraphEdge>,
  nodeById: ReadonlyMap<string, ISlideGraphNode>,
): number {
  const orientations = new Map<string, Set<"H" | "V">>();
  for (const edge of slideEdges) {
    const points = [nodeById.get(edge.fromNodeId)!.point, ...edge.path];
    for (let index = 1; index < points.length; index += 1) {
      const orientation = points[index - 1]!.x === points[index]!.x ? "V" : "H";
      for (const point of [points[index - 1]!, points[index]!]) {
        const values = orientations.get(pointKey(point)) ?? new Set<"H" | "V">();
        values.add(orientation);
        orientations.set(pointKey(point), values);
      }
    }
  }
  return [...orientations.values()].filter((values) => values.size === 2).length;
}

function buildFingerprint(
  config: ISlideGeneratorConfig,
  map: MapJson,
  graph: ISlideGraph,
  solution: ISlideSolution,
): string {
  const value = [
    "islide-v3-wave-field",
    JSON.stringify(config),
    map.tiles.map((tile) => (typeof tile === "string" ? tile : JSON.stringify(tile))).join("|"),
    graph.nodes.map((node) => `${node.id}:${pointKey(node.point)}:${node.role}`).join("|"),
    graph.edges
      .map(
        (edge) => `${edge.id}:${edge.fromNodeId}>${edge.toNodeId}:${edge.entryDir}>${edge.exitDir}`,
      )
      .join("|"),
    solution.nodeIds.join(","),
    solution.edgeIds.join(","),
  ].join("\n");
  return `islide-v3-${hashString32(value).toString(16).padStart(8, "0")}`;
}

export function generateISlideLayout(input: ISlideGeneratorConfig): ISlideLayout {
  const normalized = normalizeConfig(input);
  const cached = layoutCache.get(normalized.seed);
  if (cached !== undefined) return cached;

  let generated: GeneratedAttempt | null = null;
  generationDiagnostics.length = 0;
  for (let attempt = 0; attempt < MAX_FIELD_ATTEMPTS && generated === null; attempt += 1) {
    generated = tryGenerateAttempt(normalized.seed, attempt);
  }
  if (generated === null) {
    throw new Error(
      `Unable to grow a valid sparkle-first I SLIDE for seed ${normalized.seed}: ${generationDiagnostics.join(" | ")}`,
    );
  }

  const chipCount = generated.stops.filter((stop) => stop.role === "chip").length;
  const config: ISlideGeneratorConfig = { ...normalized, chipCount };
  const nodes = buildGraphNodes(generated.stops);
  const walkEdges = buildHubEdges();
  const slideEdges = buildSlideEdges(generated.routes, generated.stops);
  const chains = buildChains(config.seed, generated.stops);
  const graph: ISlideGraph = { nodes, edges: [...walkEdges, ...slideEdges], chains };
  const solution = buildSolution(nodes, walkEdges, slideEdges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const quadrantChipCounts: [number, number, number, number] = [0, 0, 0, 0];
  for (const node of nodes) {
    if (node.role === "chip" && node.quadrant !== undefined) {
      quadrantChipCounts[node.quadrant] = (quadrantChipCounts[node.quadrant] ?? 0) + 1;
    }
  }
  const quadrantCornerGroupCounts: [number, number, number, number] = [0, 0, 0, 0];
  for (const group of generated.groups) {
    const quadrant = (group.origin.y + 0.5 < 49 ? 0 : 2) + (group.origin.x + 0.5 < 49 ? 0 : 1);
    quadrantCornerGroupCounts[quadrant] = (quadrantCornerGroupCounts[quadrant] ?? 0) + 1;
  }
  const routePointKeys = new Set<string>();
  for (const edge of slideEdges) {
    routePointKeys.add(pointKey(nodeById.get(edge.fromNodeId)!.point));
    for (const point of edge.path) routePointKeys.add(pointKey(point));
  }
  const metrics: ISlideGeneratorMetrics = {
    completeCornerGroups: generated.groups.length,
    cornerTileCount: generated.groups.length * 4 + 4,
    quadrantChipCounts,
    quadrantCornerGroupCounts,
    routeCrossings: countRouteCrossings(slideEdges, nodeById),
    routeTileCount: routePointKeys.size,
    generationWaveCount: generated.waveSizes.length,
    maxWaveSize: Math.max(...generated.waveSizes),
  };
  const layout: ISlideLayout = {
    config,
    map: generated.map,
    graph,
    solution,
    metrics,
    fingerprint: buildFingerprint(config, generated.map, graph, solution),
  };
  layoutCache.set(config.seed, layout);
  return layout;
}
