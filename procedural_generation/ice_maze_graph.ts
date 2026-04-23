import { flattenCellLayers } from "../src/c2m/cellStack.js";
import type { Dir, MapJson } from "../src/c2m/mapCodec.js";
import type {
  ExtractedIceSlideGraph,
  GridPoint,
  IceControlNode,
  ProceduralRegion,
  RegionAnchorKind,
} from "./ice_maze.js";

const ALL_DIRS: ReadonlyArray<Dir> = Object.freeze(["N", "E", "S", "W"]);
const SLIDING_TERRAIN_NAMES = new Set([
  "ICE",
  "ICE_CORNER_NE",
  "ICE_CORNER_NW",
  "ICE_CORNER_SE",
  "ICE_CORNER_SW",
]);
const CHIP_ITEM_NAMES = new Set(["IC_CHIP", "EXTRA_IC_CHIP"]);
const CORNER_TURN_BY_TILE: Readonly<Record<string, Partial<Record<Dir, Dir>>>> = Object.freeze({
  ICE_CORNER_NE: Object.freeze({
    E: "S",
    N: "W",
  }),
  ICE_CORNER_NW: Object.freeze({
    W: "S",
    N: "E",
  }),
  ICE_CORNER_SE: Object.freeze({
    E: "N",
    S: "W",
  }),
  ICE_CORNER_SW: Object.freeze({
    W: "N",
    S: "E",
  }),
});

export type IceRunTermination = "blocked" | "stopped" | "loop";

export type IceRunResult = Readonly<{
  startPoint: GridPoint;
  startDir: Dir;
  path: ReadonlyArray<GridPoint>;
  termination: IceRunTermination;
  encounteredSliding: boolean;
  stopPoint?: GridPoint;
  stopDir?: Dir;
  loopPoint?: GridPoint;
  loopDir?: Dir;
}>;

export type IceMazeTraversalOptions = Readonly<{
  chipSocketsOpen?: boolean;
}>;

export type ReciprocalIceMazeEdge = Readonly<{
  id: string;
  nodeIds: readonly [string, string];
  forwardEdgeIds: ReadonlyArray<string>;
  reverseEdgeIds: ReadonlyArray<string>;
}>;

export type ReciprocalIceMazeGraph = Readonly<{
  nodes: ReadonlyArray<IceControlNode>;
  edges: ReadonlyArray<ReciprocalIceMazeEdge>;
}>;

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function pointToIndex(point: GridPoint, map: Pick<MapJson, "width">): number {
  return point.y * map.width + point.x;
}

function comparePoints(left: GridPoint, right: GridPoint): number {
  if (left.y !== right.y) return left.y - right.y;
  return left.x - right.x;
}

function movePoint(point: GridPoint, dir: Dir): GridPoint {
  switch (dir) {
    case "N":
      return { x: point.x, y: point.y - 1 };
    case "E":
      return { x: point.x + 1, y: point.y };
    case "S":
      return { x: point.x, y: point.y + 1 };
    case "W":
      return { x: point.x - 1, y: point.y };
  }
}

function getTerrainName(map: MapJson, point: GridPoint): string {
  return flattenCellLayers(map.tiles[pointToIndex(point, map)]!).terrain.tile;
}

function getItemName(map: MapJson, point: GridPoint): string | null {
  return flattenCellLayers(map.tiles[pointToIndex(point, map)]!).item?.tile ?? null;
}

function isPointOnBoard(point: GridPoint, map: Pick<MapJson, "width" | "height">): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < map.width && point.y < map.height;
}

function isSlidingTerrainName(tileName: string): boolean {
  return SLIDING_TERRAIN_NAMES.has(tileName);
}

function isTraversableTerrainName(tileName: string, options: IceMazeTraversalOptions): boolean {
  if (tileName === "WALL") return false;
  if (tileName === "CHIP_SOCKET" && !options.chipSocketsOpen) return false;
  return true;
}

function resolveCornerTurn(tileName: string, dir: Dir): Dir | null {
  const turn = CORNER_TURN_BY_TILE[tileName]?.[dir];
  return turn ?? null;
}

function buildAllowedPointKeySet(region: ProceduralRegion): ReadonlySet<string> {
  return new Set(region.allowedPoints.map((point) => pointKey(point)));
}

function sortUniquePoints(points: Iterable<GridPoint>): GridPoint[] {
  const deduped = new Map<string, GridPoint>();
  for (const point of points) {
    deduped.set(pointKey(point), { x: point.x, y: point.y });
  }
  return [...deduped.values()].sort(comparePoints);
}

function compareDirs(left: Dir, right: Dir): number {
  return ALL_DIRS.indexOf(left) - ALL_DIRS.indexOf(right);
}

function compareNodeIds(left: string, right: string): number {
  return left.localeCompare(right);
}

function buildNodeId(point: GridPoint): string {
  return `node-${point.x}-${point.y}`;
}

function buildEdgeId(nodeId: string, dir: Dir): string {
  return `edge-${nodeId}-${dir}`;
}

function hasSemanticNodePayload(map: MapJson, point: GridPoint): boolean {
  const terrain = getTerrainName(map, point);
  if (terrain === "EXIT" || terrain === "CHIP_SOCKET") return true;
  return CHIP_ITEM_NAMES.has(getItemName(map, point) ?? "");
}

function resolveAnchorKindAtPoint(
  region: ProceduralRegion,
  point: GridPoint,
): RegionAnchorKind | null {
  return (
    region.anchors.find((anchor) => anchor.point.x === point.x && anchor.point.y === point.y)
      ?.kind ?? null
  );
}

function resolveBaseNodeRole(
  map: MapJson,
  region: ProceduralRegion,
  point: GridPoint,
): IceControlNode["role"] | null {
  const anchorKind = resolveAnchorKindAtPoint(region, point);
  if (anchorKind === "entry") return "start";
  if (anchorKind === "exit") return "exit";

  const terrain = getTerrainName(map, point);
  if (terrain === "EXIT") return "exit";
  if (terrain === "CHIP_SOCKET") return "socket";
  if (CHIP_ITEM_NAMES.has(getItemName(map, point) ?? "")) return "chip";
  return null;
}

function buildStopPointSeedSet(
  map: MapJson,
  region: ProceduralRegion,
  options: IceMazeTraversalOptions,
): ReadonlySet<string> {
  const stopPoints = new Set<string>();
  const allowedPointKeys = buildAllowedPointKeySet(region);

  for (const point of region.allowedPoints) {
    const terrain = getTerrainName(map, point);
    if (!isTraversableTerrainName(terrain, options)) continue;

    for (const dir of ALL_DIRS) {
      const result = simulateIceRun(map, region, point, dir, options, allowedPointKeys);
      if (
        result.termination === "stopped" &&
        result.encounteredSliding &&
        result.stopPoint !== undefined
      ) {
        stopPoints.add(pointKey(result.stopPoint));
      }
    }
  }

  return stopPoints;
}

export function simulateIceRun(
  map: MapJson,
  region: ProceduralRegion,
  startPoint: GridPoint,
  startDir: Dir,
  options: IceMazeTraversalOptions = {},
  allowedPointKeys: ReadonlySet<string> = buildAllowedPointKeySet(region),
): IceRunResult {
  const startTerrain = getTerrainName(map, startPoint);
  if (!isTraversableTerrainName(startTerrain, options)) {
    return {
      startPoint,
      startDir,
      path: [],
      termination: "blocked",
      encounteredSliding: false,
    };
  }

  const visitedSlidingStates = new Set<string>();
  const path: GridPoint[] = [];
  let currentPoint = startPoint;
  let currentDir = startDir;
  let encounteredSliding = false;

  while (true) {
    const nextPoint = movePoint(currentPoint, currentDir);
    if (!isPointOnBoard(nextPoint, map) || !allowedPointKeys.has(pointKey(nextPoint))) {
      if (path.length === 0) {
        return {
          startPoint,
          startDir,
          path,
          termination: "blocked",
          encounteredSliding,
        };
      }

      return {
        startPoint,
        startDir,
        path,
        termination: "stopped",
        encounteredSliding,
        stopPoint: currentPoint,
        stopDir: currentDir,
      };
    }

    const nextTerrain = getTerrainName(map, nextPoint);
    if (!isTraversableTerrainName(nextTerrain, options)) {
      if (path.length === 0) {
        return {
          startPoint,
          startDir,
          path,
          termination: "blocked",
          encounteredSliding,
        };
      }

      return {
        startPoint,
        startDir,
        path,
        termination: "stopped",
        encounteredSliding,
        stopPoint: currentPoint,
        stopDir: currentDir,
      };
    }

    if (nextTerrain !== "ICE" && nextTerrain in CORNER_TURN_BY_TILE) {
      const turnedDir = resolveCornerTurn(nextTerrain, currentDir);
      if (turnedDir === null) {
        if (path.length === 0) {
          return {
            startPoint,
            startDir,
            path,
            termination: "blocked",
            encounteredSliding,
          };
        }

        return {
          startPoint,
          startDir,
          path,
          termination: "stopped",
          encounteredSliding,
          stopPoint: currentPoint,
          stopDir: currentDir,
        };
      }
    }

    currentPoint = nextPoint;
    path.push(currentPoint);

    if (!isSlidingTerrainName(nextTerrain)) {
      return {
        startPoint,
        startDir,
        path,
        termination: "stopped",
        encounteredSliding,
        stopPoint: currentPoint,
        stopDir: currentDir,
      };
    }

    encounteredSliding = true;
    currentDir = nextTerrain === "ICE" ? currentDir : resolveCornerTurn(nextTerrain, currentDir)!;

    const stateKey = `${pointKey(currentPoint)}/${currentDir}`;
    if (visitedSlidingStates.has(stateKey)) {
      return {
        startPoint,
        startDir,
        path,
        termination: "loop",
        encounteredSliding,
        loopPoint: currentPoint,
        loopDir: currentDir,
      };
    }
    visitedSlidingStates.add(stateKey);
  }
}

export function normalizeExtractedIceMazeGraph(
  graph: ExtractedIceSlideGraph,
): ExtractedIceSlideGraph {
  return {
    ...graph,
    nodes: [...graph.nodes].sort((left, right) => compareNodeIds(left.id, right.id)),
    edges: [...graph.edges].sort((left, right) => {
      const fromCompare = compareNodeIds(left.fromNodeId, right.fromNodeId);
      if (fromCompare !== 0) return fromCompare;

      const dirCompare = compareDirs(left.entryDir, right.entryDir);
      if (dirCompare !== 0) return dirCompare;

      const toCompare = compareNodeIds(left.toNodeId, right.toNodeId);
      if (toCompare !== 0) return toCompare;

      return compareNodeIds(left.id, right.id);
    }),
  };
}

export function buildReciprocalIceMazeGraph(graph: ExtractedIceSlideGraph): ReciprocalIceMazeGraph {
  const groupedEdges = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const key = `${edge.fromNodeId}->${edge.toNodeId}`;
    const existing = groupedEdges.get(key) ?? [];
    existing.push(edge.id);
    groupedEdges.set(key, existing);
  }

  const pairKeys = new Set<string>();
  const reciprocalEdges: ReciprocalIceMazeEdge[] = [];

  for (const edge of graph.edges) {
    const leftNodeId = edge.fromNodeId <= edge.toNodeId ? edge.fromNodeId : edge.toNodeId;
    const rightNodeId = edge.fromNodeId <= edge.toNodeId ? edge.toNodeId : edge.fromNodeId;
    const pairKey = `${leftNodeId}<->${rightNodeId}`;
    if (pairKeys.has(pairKey)) continue;
    pairKeys.add(pairKey);

    const forwardEdgeIds = [...(groupedEdges.get(`${leftNodeId}->${rightNodeId}`) ?? [])].sort(
      compareNodeIds,
    );
    const reverseEdgeIds = [...(groupedEdges.get(`${rightNodeId}->${leftNodeId}`) ?? [])].sort(
      compareNodeIds,
    );

    if (leftNodeId === rightNodeId) {
      if (forwardEdgeIds.length === 0) continue;
    } else if (forwardEdgeIds.length === 0 || reverseEdgeIds.length === 0) {
      continue;
    }

    reciprocalEdges.push({
      id: `reciprocal-${leftNodeId}-${rightNodeId}`,
      nodeIds: [leftNodeId, rightNodeId],
      forwardEdgeIds,
      reverseEdgeIds,
    });
  }

  reciprocalEdges.sort((left, right) => compareNodeIds(left.id, right.id));

  const nodeIdsInReciprocalEdges = new Set(
    reciprocalEdges.flatMap((edge) => [edge.nodeIds[0], edge.nodeIds[1]]),
  );

  return {
    nodes: graph.nodes.filter((node) => nodeIdsInReciprocalEdges.has(node.id)),
    edges: reciprocalEdges,
  };
}

export function extractIceMazeGraph(
  map: MapJson,
  region: ProceduralRegion,
  options: IceMazeTraversalOptions = {},
): ExtractedIceSlideGraph {
  const allowedPointKeys = buildAllowedPointKeySet(region);
  const anchorPoints = sortUniquePoints(region.anchors.map((anchor) => anchor.point));

  for (const anchorPoint of anchorPoints) {
    const terrain = getTerrainName(map, anchorPoint);
    if (!isTraversableTerrainName(terrain, options)) {
      throw new Error(
        `Region anchor at (${anchorPoint.x},${anchorPoint.y}) is not traversable for ice extraction`,
      );
    }
  }

  const stopPointSeeds = buildStopPointSeedSet(map, region, options);
  const activePoints = sortUniquePoints([
    ...anchorPoints,
    ...region.allowedPoints.filter((point) => stopPointSeeds.has(pointKey(point))),
    ...region.allowedPoints.filter((point) => hasSemanticNodePayload(map, point)),
  ]);
  const activePointKeySet = new Set(activePoints.map((point) => pointKey(point)));

  const preliminaryNodes = activePoints.map((point) => ({
    id: buildNodeId(point),
    point,
    role: "junction" as const,
    ...(region.anchors.find((anchor) => anchor.point.x === point.x && anchor.point.y === point.y)
      ? {
          anchorId: region.anchors.find(
            (anchor) => anchor.point.x === point.x && anchor.point.y === point.y,
          )!.id,
        }
      : {}),
  }));
  const nodeIdByPointKey = new Map(preliminaryNodes.map((node) => [pointKey(node.point), node.id]));

  const directedEdges = preliminaryNodes.flatMap((node) => {
    return ALL_DIRS.flatMap((dir) => {
      const result = simulateIceRun(map, region, node.point, dir, options, allowedPointKeys);
      if (
        result.termination !== "stopped" ||
        !result.encounteredSliding ||
        result.stopPoint === undefined ||
        !activePointKeySet.has(pointKey(result.stopPoint))
      ) {
        return [];
      }

      return [
        {
          id: buildEdgeId(node.id, dir),
          fromNodeId: node.id,
          toNodeId: nodeIdByPointKey.get(pointKey(result.stopPoint))!,
          entryDir: dir,
          exitDir: result.stopDir!,
          path: result.path,
        },
      ];
    });
  });

  const preliminaryGraph = normalizeExtractedIceMazeGraph({
    region,
    nodes: preliminaryNodes,
    edges: directedEdges,
  });
  const reciprocalGraph = buildReciprocalIceMazeGraph(preliminaryGraph);
  const reciprocalDegreeByNodeId = new Map<string, number>();

  for (const edge of reciprocalGraph.edges) {
    const [leftNodeId, rightNodeId] = edge.nodeIds;
    reciprocalDegreeByNodeId.set(leftNodeId, (reciprocalDegreeByNodeId.get(leftNodeId) ?? 0) + 1);
    if (leftNodeId !== rightNodeId) {
      reciprocalDegreeByNodeId.set(
        rightNodeId,
        (reciprocalDegreeByNodeId.get(rightNodeId) ?? 0) + 1,
      );
    }
  }

  const nodes: IceControlNode[] = preliminaryGraph.nodes.map((node) => {
    const baseRole = resolveBaseNodeRole(map, region, node.point);
    if (baseRole !== null) {
      return {
        ...node,
        role: baseRole,
      };
    }

    const reciprocalDegree = reciprocalDegreeByNodeId.get(node.id) ?? 0;
    return {
      ...node,
      role: reciprocalDegree <= 1 ? "leaf" : "junction",
    };
  });

  return normalizeExtractedIceMazeGraph({
    region,
    nodes,
    edges: preliminaryGraph.edges,
  });
}
