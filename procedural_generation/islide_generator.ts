import { buildCellFromLayers } from "../src/c2m/cellStack.js";
import type { Dir, MapJson, TileSpecJson } from "../src/c2m/mapCodec.js";

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

export const DEFAULT_ISLIDE_GENERATOR_CONFIG: ISlideGeneratorConfig = Object.freeze({
  seed: "i-slide-99",
  chipCount: 99,
  branchCount: 8,
  loopCount: 2,
  sparkleDensity: 64,
  routeSpread: 82,
  asymmetry: 68,
});

export type ISlidePoint = Readonly<{
  x: number;
  y: number;
}>;

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
}>;

export type ISlideLayout = Readonly<{
  config: ISlideGeneratorConfig;
  map: MapJson;
  graph: ISlideGraph;
  solution: ISlideSolution;
  metrics: ISlideGeneratorMetrics;
  fingerprint: string;
}>;

type MutableChain = {
  id: string;
  kind: "tail" | "loop";
  quadrant: number;
  rootPoint: ISlidePoint;
  outwardDir: Dir;
  horizontalFirstAfterLaunch: boolean;
  points: ISlidePoint[];
};

type ChainPort = Readonly<{
  rootPoint: ISlidePoint;
  outwardDir: Dir;
  quadrant: number;
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
const PINWHEEL_TILES = Object.freeze([
  "ICE_CORNER_NW",
  "ICE_CORNER_NE",
  "ICE_CORNER_SW",
  "ICE_CORNER_SE",
] as const);
const SOCKET_SPLIT_SPARKLE_TILES: ReadonlyArray<
  Readonly<{ point: ISlidePoint; tile: TileSpecJson }>
> = Object.freeze([
  { point: { x: ISLIDE_SOCKET_POINT.x - 1, y: ISLIDE_SOCKET_POINT.y }, tile: "ICE_CORNER_NW" },
  { point: { x: ISLIDE_SOCKET_POINT.x + 1, y: ISLIDE_SOCKET_POINT.y }, tile: "ICE_CORNER_NE" },
  {
    point: { x: ISLIDE_SOCKET_POINT.x - 1, y: ISLIDE_SOCKET_POINT.y + 1 },
    tile: "ICE_CORNER_SW",
  },
  {
    point: { x: ISLIDE_SOCKET_POINT.x + 1, y: ISLIDE_SOCKET_POINT.y + 1 },
    tile: "ICE_CORNER_SE",
  },
]);
const CHAIN_PORTS: ReadonlyArray<ChainPort> = Object.freeze([
  { rootPoint: { x: 47, y: ISLIDE_ISLAND_MIN }, outwardDir: "N", quadrant: 0 },
  { rootPoint: { x: 51, y: ISLIDE_ISLAND_MIN }, outwardDir: "N", quadrant: 1 },
  { rootPoint: { x: 47, y: ISLIDE_ISLAND_MAX }, outwardDir: "S", quadrant: 2 },
  { rootPoint: { x: 51, y: ISLIDE_ISLAND_MAX }, outwardDir: "S", quadrant: 3 },
  { rootPoint: { x: ISLIDE_ISLAND_MAX, y: 51 }, outwardDir: "E", quadrant: 3 },
  { rootPoint: { x: ISLIDE_ISLAND_MIN, y: 47 }, outwardDir: "W", quadrant: 0 },
  { rootPoint: { x: ISLIDE_ISLAND_MIN, y: 51 }, outwardDir: "W", quadrant: 2 },
  { rootPoint: { x: ISLIDE_ISLAND_MAX, y: 47 }, outwardDir: "E", quadrant: 1 },
]);

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function normalizeConfig(input: ISlideGeneratorConfig): ISlideGeneratorConfig {
  const requestedChipCount = clampInteger(input.chipCount, 4, 160);
  const branchCount = clampInteger(input.branchCount, 4, Math.min(8, requestedChipCount));
  const chipCount = Math.min(requestedChipCount, branchCount * 20);
  return {
    seed: String(input.seed),
    chipCount,
    branchCount,
    loopCount: clampInteger(input.loopCount, 0, Math.min(2, branchCount)),
    sparkleDensity: clampInteger(input.sparkleDensity, 0, 100),
    routeSpread: clampInteger(input.routeSpread, 0, 100),
    asymmetry: clampInteger(input.asymmetry, 0, 100),
  };
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

function randomInteger(nextRandom: () => number, minimum: number, maximum: number): number {
  return minimum + Math.floor(nextRandom() * (maximum - minimum + 1));
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

function comparePoints(left: ISlidePoint, right: ISlidePoint): number {
  if (left.y !== right.y) return left.y - right.y;
  return left.x - right.x;
}

function directionBetween(from: ISlidePoint, to: ISlidePoint): Dir {
  if (to.x > from.x && to.y === from.y) return "E";
  if (to.x < from.x && to.y === from.y) return "W";
  if (to.y > from.y && to.x === from.x) return "S";
  if (to.y < from.y && to.x === from.x) return "N";
  throw new Error(`Points (${from.x},${from.y}) and (${to.x},${to.y}) are not adjacent`);
}

function oppositeDirection(dir: Dir): Dir {
  return DIRECTIONS[(DIRECTIONS.indexOf(dir) + 2) % 4]!;
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

function buildOrthogonalPath(
  from: ISlidePoint,
  to: ISlidePoint,
  horizontalFirst: boolean,
): ISlidePoint[] {
  const path: ISlidePoint[] = [];
  if (from.x === to.x || from.y === to.y) {
    appendAxisRun(path, from, to);
    return path;
  }

  const bend = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  appendAxisRun(path, from, bend);
  appendAxisRun(path, bend, to);
  return path;
}

function buildExitPath(): ISlidePoint[] {
  const path: ISlidePoint[] = [];
  let cursor: ISlidePoint = ISLIDE_SOCKET_POINT;
  for (const target of [
    { x: ISLIDE_CENTER.x, y: 1 },
    { x: 97, y: 1 },
    { x: 97, y: ISLIDE_EXIT_POINT.y },
    ISLIDE_EXIT_POINT,
  ]) {
    cursor = appendAxisRun(path, cursor, target);
  }
  return path;
}

function buildLoopReturnPath(
  from: ISlidePoint,
  loopIndex: number,
): Readonly<{
  returnPoint: ISlidePoint;
  path: ReadonlyArray<ISlidePoint>;
}> {
  const path: ISlidePoint[] = [];
  let cursor = from;
  const returnPoint =
    loopIndex === 0
      ? { x: ISLIDE_ISLAND_MIN, y: ISLIDE_CENTER.y }
      : { x: ISLIDE_CENTER.x, y: ISLIDE_ISLAND_MAX };
  const waypoints =
    loopIndex === 0
      ? [{ x: 1, y: from.y }, { x: 1, y: ISLIDE_CENTER.y }, returnPoint]
      : [{ x: 96, y: from.y }, { x: 96, y: 97 }, { x: ISLIDE_CENTER.x, y: 97 }, returnPoint];
  for (const waypoint of waypoints) cursor = appendAxisRun(path, cursor, waypoint);
  return { returnPoint, path };
}

function buildEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  from: ISlidePoint,
  path: ReadonlyArray<ISlidePoint>,
  kind: "walk" | "slide",
): ISlideGraphEdge {
  if (path.length === 0) throw new Error(`Edge ${id} must have a non-empty path`);
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
        role: x === ISLIDE_CENTER.x && y === ISLIDE_CENTER.y ? "start" : "hub",
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
          buildEdge(
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

function allocateQuadrantCounts(
  total: number,
  permutation: ReadonlyArray<number>,
): [number, number, number, number] {
  const counts: [number, number, number, number] = [
    Math.floor(total / 4),
    Math.floor(total / 4),
    Math.floor(total / 4),
    Math.floor(total / 4),
  ];
  for (let index = 0; index < total % 4; index += 1) {
    const quadrant = permutation[index]!;
    counts[quadrant] = (counts[quadrant] ?? 0) + 1;
  }
  return counts;
}

function distanceSquared(left: ISlidePoint, right: ISlidePoint): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function localPointInQuadrant(port: ChainPort, u: number, v: number): ISlidePoint {
  const horizontalSign = port.quadrant % 2 === 0 ? -1 : 1;
  const verticalSign = port.quadrant < 2 ? -1 : 1;
  return {
    x: port.rootPoint.x + horizontalSign * u,
    y: port.rootPoint.y + verticalSign * v,
  };
}

function shuffleWithStrength<T>(values: T[], nextRandom: () => number, strength: number): void {
  const swaps = Math.round(values.length * 2 * (strength / 100));
  for (let index = 0; index < swaps; index += 1) {
    const left = Math.floor(nextRandom() * values.length);
    const right = Math.floor(nextRandom() * values.length);
    const value = values[left]!;
    values[left] = values[right]!;
    values[right] = value;
  }
}

function selectLocalCoordinates(
  parity: "even" | "odd",
  count: number,
  config: ISlideGeneratorConfig,
): number[] {
  if (count === 0) return [];
  const first = parity === "even" ? 4 : 3;
  const cap = parity === "even" ? 42 : 41;
  const desiredMaximum = first + Math.round((cap - first) * (config.routeSpread / 100));
  const requiredMaximum = first + (count - 1) * 2;
  const maximum = Math.min(cap, Math.max(desiredMaximum, requiredMaximum));
  const candidates: number[] = [];
  for (let value = first; value <= maximum; value += 2) candidates.push(value);

  if (count === 1) return [candidates[0]!];
  const selected: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidateIndex = Math.round((index * (candidates.length - 1)) / (count - 1));
    selected.push(candidates[candidateIndex]!);
  }
  return selected;
}

function generateChainPoints(
  port: ChainPort,
  count: number,
  config: ISlideGeneratorConfig,
  chainIndex: number,
): ISlidePoint[] {
  const verticalLaunch = port.outwardDir === "N" || port.outwardDir === "S";
  const parity = verticalLaunch ? "even" : "odd";
  const primaryCoordinates = selectLocalCoordinates(parity, count, config);
  const secondaryCoordinates = selectLocalCoordinates(parity, count - 1, config);
  const firstPrimary = primaryCoordinates.shift()!;
  shuffleWithStrength(
    primaryCoordinates,
    createRandom(config.seed, `chain-${chainIndex}-primary-${config.asymmetry}`),
    config.asymmetry,
  );
  shuffleWithStrength(
    secondaryCoordinates,
    createRandom(config.seed, `chain-${chainIndex}-secondary-${config.asymmetry}`),
    config.asymmetry,
  );

  const points: ISlidePoint[] = [
    verticalLaunch
      ? localPointInQuadrant(port, 0, firstPrimary)
      : localPointInQuadrant(port, firstPrimary, 0),
  ];
  for (let index = 0; index < count - 1; index += 1) {
    points.push(
      verticalLaunch
        ? localPointInQuadrant(port, secondaryCoordinates[index]!, primaryCoordinates[index]!)
        : localPointInQuadrant(port, primaryCoordinates[index]!, secondaryCoordinates[index]!),
    );
  }
  return points;
}

function buildChains(config: ISlideGeneratorConfig): Readonly<{
  chains: ReadonlyArray<MutableChain>;
  quadrantCounts: [number, number, number, number];
}> {
  const chipCountsByChain = Array<number>(config.branchCount).fill(
    Math.floor(config.chipCount / config.branchCount),
  );
  const remainderOrder = Array.from({ length: config.branchCount }, (_, index) => index);
  shuffleInPlace(remainderOrder, createRandom(config.seed, "chip-remainder-permutation"));
  for (let index = 0; index < config.chipCount % config.branchCount; index += 1) {
    const chainIndex = remainderOrder[index]!;
    chipCountsByChain[chainIndex] = (chipCountsByChain[chainIndex] ?? 0) + 1;
  }

  const chains: MutableChain[] = CHAIN_PORTS.slice(0, config.branchCount).map((port, index) => ({
    id: `chain-${String(index + 1).padStart(2, "0")}`,
    kind: index < config.loopCount ? "loop" : "tail",
    quadrant: port.quadrant,
    rootPoint: port.rootPoint,
    outwardDir: port.outwardDir,
    horizontalFirstAfterLaunch: port.outwardDir === "N" || port.outwardDir === "S",
    points: generateChainPoints(port, chipCountsByChain[index]!, config, index),
  }));
  const quadrantCounts: [number, number, number, number] = [0, 0, 0, 0];
  for (let index = 0; index < chains.length; index += 1) {
    const quadrant = chains[index]!.quadrant;
    quadrantCounts[quadrant] = (quadrantCounts[quadrant] ?? 0) + (chipCountsByChain[index] ?? 0);
  }

  return { chains, quadrantCounts };
}

function makeChipCell(): TileSpecJson {
  return buildCellFromLayers({
    terrain: { tile: "FLOOR" },
    item: { tile: "IC_CHIP" },
  });
}

function makePlayerCell(): TileSpecJson {
  return buildCellFromLayers({
    terrain: { tile: "FLOOR" },
    mob: { tile: "CHIP", dir: "N" },
  });
}

function setTile(tiles: TileSpecJson[], point: ISlidePoint, tile: TileSpecJson): void {
  tiles[point.y * ISLIDE_BOARD_SIZE + point.x] = tile;
}

function tileAt(tiles: ReadonlyArray<TileSpecJson>, point: ISlidePoint): TileSpecJson {
  return tiles[point.y * ISLIDE_BOARD_SIZE + point.x]!;
}

function addRouteCorners(
  tiles: TileSpecJson[],
  from: ISlidePoint,
  path: ReadonlyArray<ISlidePoint>,
): void {
  const points = [from, ...path];
  for (let index = 1; index < points.length - 1; index += 1) {
    const incoming = directionBetween(points[index - 1]!, points[index]!);
    const outgoing = directionBetween(points[index]!, points[index + 1]!);
    if (incoming === outgoing) continue;
    const cornerTile = CORNER_TILE_BY_TURN[`${incoming}>${outgoing}`];
    if (cornerTile) setTile(tiles, points[index]!, cornerTile);
  }
}

function countRouteCrossings(edges: ReadonlyArray<ISlideGraphEdge>): number {
  const orientations = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.kind !== "slide") continue;
    const fromNodePoint = edge.path.length > 0 ? null : undefined;
    void fromNodePoint;
    for (let index = 1; index < edge.path.length; index += 1) {
      const previous = edge.path[index - 1]!;
      const current = edge.path[index]!;
      const orientation = previous.x === current.x ? "V" : "H";
      const key = pointKey(current);
      const values = orientations.get(key) ?? new Set<string>();
      values.add(orientation);
      orientations.set(key, values);
    }
  }
  return [...orientations.values()].filter((values) => values.has("H") && values.has("V")).length;
}

function placeCornerGroups(
  tiles: TileSpecJson[],
  config: ISlideGeneratorConfig,
  reservedPointKeys: ReadonlySet<string>,
): Readonly<{
  origins: ReadonlyArray<ISlidePoint>;
  quadrantCounts: [number, number, number, number];
}> {
  const target = clampInteger(Math.round(config.sparkleDensity * 3.6), 0, 320);
  const nextRandom = createRandom(config.seed, "decorative-pinwheels");
  const quadrantPermutation = [0, 1, 2, 3];
  shuffleInPlace(quadrantPermutation, nextRandom);
  const targetByQuadrant = allocateQuadrantCounts(target, quadrantPermutation);
  const origins: ISlidePoint[] = [];
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  const occupied = new Set<string>();

  const canPlace = (origin: ISlidePoint, enforceSpacing: boolean): boolean => {
    const cells = [
      origin,
      { x: origin.x + 1, y: origin.y },
      { x: origin.x, y: origin.y + 1 },
      { x: origin.x + 1, y: origin.y + 1 },
    ];
    if (
      cells.some(
        (point) =>
          reservedPointKeys.has(pointKey(point)) ||
          occupied.has(pointKey(point)) ||
          tileAt(tiles, point) !== "ICE",
      )
    ) {
      return false;
    }
    return !enforceSpacing || origins.every((candidate) => distanceSquared(candidate, origin) >= 8);
  };

  const place = (origin: ISlidePoint, quadrant: number): void => {
    const cells = [
      origin,
      { x: origin.x + 1, y: origin.y },
      { x: origin.x, y: origin.y + 1 },
      { x: origin.x + 1, y: origin.y + 1 },
    ];
    for (let index = 0; index < cells.length; index += 1) {
      setTile(tiles, cells[index]!, PINWHEEL_TILES[index]!);
      occupied.add(pointKey(cells[index]!));
    }
    origins.push(origin);
    counts[quadrant] = (counts[quadrant] ?? 0) + 1;
  };

  for (let quadrant = 0; quadrant < 4; quadrant += 1) {
    const candidates: ISlidePoint[] = [];
    const minX = quadrant % 2 === 0 ? 1 : 50;
    const maxX = quadrant % 2 === 0 ? 47 : 96;
    const minY = quadrant < 2 ? 1 : 50;
    const maxY = quadrant < 2 ? 47 : 96;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) candidates.push({ x, y });
    }
    shuffleInPlace(candidates, createRandom(config.seed, `decorative-pinwheels-q${quadrant}`));

    for (const enforceSpacing of [true, false]) {
      for (const origin of candidates) {
        if ((counts[quadrant] ?? 0) >= targetByQuadrant[quadrant]!) break;
        if (canPlace(origin, enforceSpacing)) place(origin, quadrant);
      }
      if ((counts[quadrant] ?? 0) >= targetByQuadrant[quadrant]!) break;
    }
  }

  return { origins, quadrantCounts: counts };
}

function edgeKey(leftNodeId: string, rightNodeId: string): string {
  return leftNodeId < rightNodeId
    ? `${leftNodeId}\u0000${rightNodeId}`
    : `${rightNodeId}\u0000${leftNodeId}`;
}

function appendHubWalk(
  nodeIds: string[],
  edgeIds: string[],
  edgeIdByNodePair: ReadonlyMap<string, string>,
  target: ISlidePoint,
): void {
  const currentId = nodeIds[nodeIds.length - 1]!;
  const currentParts = currentId.split("-");
  let x = Number(currentParts[currentParts.length - 2]);
  let y = Number(currentParts[currentParts.length - 1]);
  while (x !== target.x || y !== target.y) {
    if (x !== target.x) x += Math.sign(target.x - x);
    else y += Math.sign(target.y - y);
    const nextId = hubNodeId({ x, y });
    const edgeId = edgeIdByNodePair.get(edgeKey(nodeIds[nodeIds.length - 1]!, nextId));
    if (!edgeId) throw new Error(`Missing hub edge to ${nextId}`);
    edgeIds.push(edgeId);
    nodeIds.push(nextId);
  }
}

function buildFingerprint(
  config: ISlideGeneratorConfig,
  map: MapJson,
  graph: ISlideGraph,
  solution: ISlideSolution,
): string {
  const tileSignature = map.tiles
    .map((tile) => (typeof tile === "string" ? tile : JSON.stringify(tile)))
    .join("|");
  const graphSignature = graph.nodes
    .map((node) => `${node.id}:${node.point.x},${node.point.y}:${node.role}`)
    .join("|");
  const value = [
    "islide-v1",
    JSON.stringify(config),
    tileSignature,
    graphSignature,
    solution.nodeIds.join(","),
    solution.edgeIds.join(","),
  ].join("\n");
  return `islide-v1-${hashString32(value).toString(16).padStart(8, "0")}`;
}

export function generateISlideLayout(input: ISlideGeneratorConfig): ISlideLayout {
  const config = normalizeConfig(input);
  const { chains: mutableChains, quadrantCounts } = buildChains(config);
  const nodes = buildHubNodes();
  const edges = buildHubEdges();
  const edgeIdByNodePair = new Map(
    edges.map((edge) => [edgeKey(edge.fromNodeId, edge.toNodeId), edge.id]),
  );
  const chainRecords: ISlideRouteChain[] = [];
  let chipOrdinal = 0;
  let loopOrdinal = 0;

  for (const chain of mutableChains) {
    const rootPoint = chain.rootPoint;
    const rootNodeId = hubNodeId(rootPoint);
    const chainNodeIds: string[] = [];
    let previousPoint = rootPoint;
    let previousNodeId = rootNodeId;

    for (let index = 0; index < chain.points.length; index += 1) {
      const point = chain.points[index]!;
      chipOrdinal += 1;
      const nodeId = `chip-${String(chipOrdinal).padStart(3, "0")}`;
      nodes.push({ id: nodeId, point, role: "chip", quadrant: chain.quadrant });
      chainNodeIds.push(nodeId);
      const path = buildOrthogonalPath(previousPoint, point, chain.horizontalFirstAfterLaunch);
      const edge = buildEdge(
        `slide-${chain.id}-${String(index + 1).padStart(3, "0")}`,
        previousNodeId,
        nodeId,
        previousPoint,
        path,
        "slide",
      );
      edges.push(edge);
      edgeIdByNodePair.set(edgeKey(edge.fromNodeId, edge.toNodeId), edge.id);
      previousPoint = point;
      previousNodeId = nodeId;
    }

    const loopReturn =
      chain.kind === "loop" ? buildLoopReturnPath(previousPoint, loopOrdinal) : null;
    const returnPoint = loopReturn?.returnPoint ?? rootPoint;
    const returnNodeId = hubNodeId(returnPoint);
    if (chain.kind === "loop") {
      const edge = buildEdge(
        `slide-${chain.id}-return`,
        previousNodeId,
        returnNodeId,
        previousPoint,
        loopReturn!.path,
        "slide",
      );
      edges.push(edge);
      edgeIdByNodePair.set(edgeKey(edge.fromNodeId, edge.toNodeId), edge.id);
      loopOrdinal += 1;
    }

    chainRecords.push({
      id: chain.id,
      kind: chain.kind,
      quadrant: chain.quadrant,
      nodeIds: chainNodeIds,
      rootNodeId,
      returnNodeId,
    });
  }

  const socketNode: ISlideGraphNode = {
    id: "socket",
    point: ISLIDE_SOCKET_POINT,
    role: "socket",
  };
  const exitNode: ISlideGraphNode = { id: "exit", point: ISLIDE_EXIT_POINT, role: "exit" };
  nodes.push(socketNode, exitNode);
  const northHubPoint = { x: ISLIDE_CENTER.x, y: ISLIDE_ISLAND_MIN };
  const socketPath = buildOrthogonalPath(northHubPoint, ISLIDE_SOCKET_POINT, false);
  const socketEdge = buildEdge(
    "slide-final-socket",
    hubNodeId(northHubPoint),
    socketNode.id,
    northHubPoint,
    socketPath,
    "slide",
  );
  const exitEdge = buildEdge(
    "slide-final-exit",
    socketNode.id,
    exitNode.id,
    ISLIDE_SOCKET_POINT,
    buildExitPath(),
    "slide",
  );
  edges.push(socketEdge, exitEdge);
  edgeIdByNodePair.set(edgeKey(socketEdge.fromNodeId, socketEdge.toNodeId), socketEdge.id);
  edgeIdByNodePair.set(edgeKey(exitEdge.fromNodeId, exitEdge.toNodeId), exitEdge.id);

  const solutionNodeIds = [hubNodeId(ISLIDE_CENTER)];
  const solutionEdgeIds: string[] = [];
  const collectedChipNodeIds: string[] = [];
  for (const chain of chainRecords) {
    const rootPoint = nodes.find((node) => node.id === chain.rootNodeId)!.point;
    appendHubWalk(solutionNodeIds, solutionEdgeIds, edgeIdByNodePair, rootPoint);
    for (const chipNodeId of chain.nodeIds) {
      const edgeId = edgeIdByNodePair.get(
        edgeKey(solutionNodeIds[solutionNodeIds.length - 1]!, chipNodeId),
      );
      if (!edgeId) throw new Error(`Missing route edge to ${chipNodeId}`);
      solutionEdgeIds.push(edgeId);
      solutionNodeIds.push(chipNodeId);
      collectedChipNodeIds.push(chipNodeId);
    }
    if (chain.kind === "loop") {
      const edgeId = edgeIdByNodePair.get(
        edgeKey(solutionNodeIds[solutionNodeIds.length - 1]!, chain.returnNodeId),
      );
      if (!edgeId) throw new Error(`Missing loop return edge for ${chain.id}`);
      solutionEdgeIds.push(edgeId);
      solutionNodeIds.push(chain.returnNodeId);
    } else {
      const returnIds = [chain.rootNodeId, ...chain.nodeIds].reverse().slice(1);
      for (const returnNodeId of returnIds) {
        const edgeId = edgeIdByNodePair.get(
          edgeKey(solutionNodeIds[solutionNodeIds.length - 1]!, returnNodeId),
        );
        if (!edgeId) throw new Error(`Missing tail return edge for ${chain.id}`);
        solutionEdgeIds.push(edgeId);
        solutionNodeIds.push(returnNodeId);
      }
    }
  }
  appendHubWalk(solutionNodeIds, solutionEdgeIds, edgeIdByNodePair, northHubPoint);
  solutionEdgeIds.push(socketEdge.id);
  solutionNodeIds.push(socketNode.id);
  solutionEdgeIds.push(exitEdge.id);
  solutionNodeIds.push(exitNode.id);

  const graph: ISlideGraph = { nodes, edges, chains: chainRecords };
  const solution: ISlideSolution = {
    nodeIds: solutionNodeIds,
    edgeIds: solutionEdgeIds,
    collectedChipNodeIds,
  };

  const tiles = Array<TileSpecJson>(ISLIDE_BOARD_SIZE * ISLIDE_BOARD_SIZE).fill("ICE");
  for (let coordinate = 0; coordinate < ISLIDE_BOARD_SIZE; coordinate += 1) {
    setTile(tiles, { x: coordinate, y: 0 }, "WALL");
    setTile(tiles, { x: coordinate, y: ISLIDE_BOARD_SIZE - 1 }, "WALL");
    setTile(tiles, { x: 0, y: coordinate }, "WALL");
    setTile(tiles, { x: ISLIDE_BOARD_SIZE - 1, y: coordinate }, "WALL");
  }

  const routeReserved = new Set<string>();
  for (const node of nodes) routeReserved.add(pointKey(node.point));
  for (const edge of edges) {
    const from = nodes.find((node) => node.id === edge.fromNodeId)!.point;
    routeReserved.add(pointKey(from));
    for (const point of edge.path) routeReserved.add(pointKey(point));
    if (edge.kind === "slide") addRouteCorners(tiles, from, edge.path);
  }
  for (const sparkleTile of SOCKET_SPLIT_SPARKLE_TILES) {
    routeReserved.add(pointKey(sparkleTile.point));
  }

  const cornerGroups = placeCornerGroups(tiles, config, routeReserved);
  for (const sparkleTile of SOCKET_SPLIT_SPARKLE_TILES) {
    setTile(tiles, sparkleTile.point, sparkleTile.tile);
  }

  for (let y = ISLIDE_ISLAND_MIN; y <= ISLIDE_ISLAND_MAX; y += 1) {
    for (let x = ISLIDE_ISLAND_MIN; x <= ISLIDE_ISLAND_MAX; x += 1) {
      setTile(tiles, { x, y }, "FLOOR");
    }
  }
  setTile(tiles, ISLIDE_CENTER, makePlayerCell());
  for (const node of nodes) {
    if (node.role === "chip") setTile(tiles, node.point, makeChipCell());
  }
  setTile(tiles, ISLIDE_SOCKET_POINT, "CHIP_SOCKET");
  setTile(tiles, ISLIDE_EXIT_POINT, "EXIT");

  const map: MapJson = {
    width: ISLIDE_BOARD_SIZE,
    height: ISLIDE_BOARD_SIZE,
    tiles,
  };
  const cornerTileCount = tiles.filter(
    (tile) => typeof tile === "string" && tile.startsWith("ICE_CORNER_"),
  ).length;
  const metrics: ISlideGeneratorMetrics = {
    completeCornerGroups: cornerGroups.origins.length,
    cornerTileCount,
    quadrantChipCounts: quadrantCounts,
    quadrantCornerGroupCounts: cornerGroups.quadrantCounts,
    routeCrossings: countRouteCrossings(edges),
    routeTileCount: routeReserved.size,
  };

  return {
    config,
    map,
    graph,
    solution,
    metrics,
    fingerprint: buildFingerprint(config, map, graph, solution),
  };
}
