import { describe, expect, it } from "vitest";

import { flattenCellLayers } from "../src/c2m/cellStack.js";
import { createProceduralRegion } from "../procedural_generation/ice_maze.js";
import { extractIceMazeGraph, simulateIceRun } from "../procedural_generation/ice_maze_graph.js";
import {
  DEFAULT_ISLIDE_GENERATOR_CONFIG,
  generateISlideLayout,
} from "../procedural_generation/islide_generator.js";
import type { Dir } from "../src/c2m/mapCodec.js";

function opposite(dir: Dir): Dir {
  return ({ N: "S", E: "W", S: "N", W: "E" } as const)[dir];
}

function directionBetween(
  from: Readonly<{ x: number; y: number }>,
  to: Readonly<{ x: number; y: number }>,
): Dir {
  if (from.x === to.x) return to.y > from.y ? "S" : "N";
  if (from.y === to.y) return to.x > from.x ? "E" : "W";
  throw new Error(`Non-orthogonal test path from ${from.x},${from.y} to ${to.x},${to.y}`);
}

function countTile(layout: ReturnType<typeof generateISlideLayout>, tileName: string): number {
  return layout.map.tiles.filter((tile) => {
    const layers = flattenCellLayers(tile);
    return (
      layers.terrain.tile === tileName ||
      layers.item?.tile === tileName ||
      layers.mob?.tile === tileName
    );
  }).length;
}

function terrainAt(layout: ReturnType<typeof generateISlideLayout>, x: number, y: number): string {
  return flattenCellLayers(layout.map.tiles[x + y * layout.map.width]!).terrain.tile;
}

const INWARD_SPARKLE_PATTERN = [
  { dx: 0, dy: 0, tile: "ICE_CORNER_SE" },
  { dx: 1, dy: 0, tile: "ICE_CORNER_SW" },
  { dx: 0, dy: 1, tile: "ICE_CORNER_NE" },
  { dx: 1, dy: 1, tile: "ICE_CORNER_NW" },
] as const;

function inwardSparkleOrigins(layout: ReturnType<typeof generateISlideLayout>) {
  const origins: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < layout.map.height - 1; y += 1) {
    for (let x = 0; x < layout.map.width - 1; x += 1) {
      if (
        INWARD_SPARKLE_PATTERN.every(
          ({ dx, dy, tile }) => terrainAt(layout, x + dx, y + dy) === tile,
        )
      ) {
        origins.push({ x, y });
      }
    }
  }
  return origins;
}

function coordinateSetOverlap(
  points: ReadonlyArray<Readonly<{ x: number; y: number }>>,
  transform: (point: Readonly<{ x: number; y: number }>) => Readonly<{ x: number; y: number }>,
): number {
  const original = new Set(points.map((point) => `${point.x},${point.y}`));
  const transformed = new Set(
    points.map((point) => {
      const output = transform(point);
      return `${output.x},${output.y}`;
    }),
  );
  const intersection = [...original].filter((key) => transformed.has(key)).length;
  return intersection / Math.max(original.size, transformed.size, 1);
}

function physicalEdgeKey(
  from: Readonly<{ x: number; y: number }>,
  entryDir: Dir,
  to: Readonly<{ x: number; y: number }>,
  path: ReadonlyArray<Readonly<{ x: number; y: number }>>,
): string {
  return `${from.x},${from.y}/${entryDir}>${to.x},${to.y}/${path
    .map((point) => `${point.x},${point.y}`)
    .join(";")}`;
}

describe("deterministic I SLIDE generator", { timeout: 120_000 }, () => {
  it("reproduces the same 99x99 map, graph, and solution for identical controls", () => {
    const first = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const second = generateISlideLayout({ ...DEFAULT_ISLIDE_GENERATOR_CONFIG });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.map).toEqual(second.map);
    expect(first.graph).toEqual(second.graph);
    expect(first.solution).toEqual(second.solution);
    expect(first.map.width).toBe(99);
    expect(first.map.height).toBe(99);
  });

  it("preserves the source landmarks and accepts a physical chip outcome near 99", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const centerIndex = 49 + 49 * layout.map.width;

    expect(flattenCellLayers(layout.map.tiles[centerIndex]!).mob?.tile).toBe("CHIP");
    expect(countTile(layout, "IC_CHIP")).toBe(layout.config.chipCount);
    expect(layout.config.chipCount).toBeGreaterThanOrEqual(88);
    expect(layout.config.chipCount).toBeLessThanOrEqual(124);
    expect(countTile(layout, "CHIP_SOCKET")).toBe(1);
    expect(countTile(layout, "EXIT")).toBe(1);
    expect(countTile(layout, "CLUE")).toBe(1);
    expect(terrainAt(layout, 49, 47)).toBe("CLUE");
    expect(layout.metrics.completeCornerGroups).toBeGreaterThanOrEqual(190);
    expect(layout.metrics.completeCornerGroups).toBeLessThanOrEqual(230);
    expect(layout.metrics.quadrantChipCounts.every((count) => count >= 15)).toBe(true);
    expect(layout.metrics.routeCrossings).toBeGreaterThan(0);
    expect(layout.metrics.generationWaveCount).toBeGreaterThanOrEqual(4);
    expect(layout.metrics.maxWaveSize).toBeGreaterThan(1);
  });

  it("scales the source starting island to a readable 9x9 hub with distinct launch ports", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const islandCells = [];
    for (let y = 45; y <= 53; y += 1) {
      for (let x = 45; x <= 53; x += 1) {
        islandCells.push(flattenCellLayers(layout.map.tiles[x + y * layout.map.width]!));
      }
    }
    const nodeById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
    const launchPoints = layout.graph.chains.map((chain) => nodeById.get(chain.rootNodeId)!.point);

    expect(islandCells).toHaveLength(81);
    expect(
      islandCells.every((cell) => cell.terrain.tile === "FLOOR" || cell.terrain.tile === "CLUE"),
    ).toBe(true);
    expect(layout.graph.nodes.filter((node) => node.role === "hub")).toHaveLength(80);
    expect(new Set(launchPoints.map((point) => `${point.x},${point.y}`)).size).toBe(8);
    expect(
      launchPoints.every(
        (point) => point.x === 45 || point.x === 53 || point.y === 45 || point.y === 53,
      ),
    ).toBe(true);
    expect(9 / layout.map.width).toBeGreaterThan(0.09);
  });

  it("frames the socket with the inward source split sparkle and gives it one exit arm", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const splitSocketCenters = [];
    for (let y = 0; y < layout.map.height - 1; y += 1) {
      for (let x = 1; x < layout.map.width - 1; x += 1) {
        if (
          terrainAt(layout, x, y) === "CHIP_SOCKET" &&
          terrainAt(layout, x - 1, y) === "ICE_CORNER_SE" &&
          terrainAt(layout, x + 1, y) === "ICE_CORNER_SW" &&
          terrainAt(layout, x - 1, y + 1) === "ICE_CORNER_NE" &&
          terrainAt(layout, x, y + 1) === "ICE" &&
          terrainAt(layout, x + 1, y + 1) === "ICE_CORNER_NW"
        ) {
          splitSocketCenters.push({ x, y });
        }
      }
    }
    const socketExitEdges = layout.graph.edges.filter(
      (edge) => edge.fromNodeId === "socket" && edge.toNodeId === "exit",
    );
    const exitEdges = layout.graph.edges.filter(
      (edge) => edge.fromNodeId === "exit" || edge.toNodeId === "exit",
    );
    const socketSolutionIndex = layout.solution.nodeIds.indexOf("socket");
    const region = createProceduralRegion({
      board: { width: layout.map.width, height: layout.map.height },
      mask: {
        kind: "rect",
        rect: { x: 0, y: 0, width: layout.map.width, height: layout.map.height },
      },
    });
    const runFromSocket = (dir: Dir) =>
      simulateIceRun(layout.map, region, { x: 49, y: 31 }, dir, {
        chipSocketsOpen: true,
      });

    expect(splitSocketCenters).toEqual([{ x: 49, y: 31 }]);
    expect(socketExitEdges).toHaveLength(1);
    expect(exitEdges).toEqual(socketExitEdges);
    expect(layout.solution.nodeIds[socketSolutionIndex + 1]).toBe("exit");
    expect(layout.solution.edgeIds[socketSolutionIndex]).toBe(socketExitEdges[0]!.id);
    expect(runFromSocket("E").termination).toBe("blocked");
    expect(runFromSocket("W").termination).toBe("blocked");
    expect(runFromSocket("N").stopPoint).toEqual({ x: 98, y: 49 });
    expect(runFromSocket("S").stopPoint).toEqual({ x: 49, y: 45 });
  });

  it("owns every ordinary corner by one inward route sparkle with no inverted groups", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const origins = inwardSparkleOrigins(layout);
    const socketCornerKeys = new Set(["48,31", "50,31", "48,32", "50,32"]);
    const ownership = new Map<string, number>();
    for (const origin of origins) {
      for (const { dx, dy } of INWARD_SPARKLE_PATTERN) {
        const key = `${origin.x + dx},${origin.y + dy}`;
        ownership.set(key, (ownership.get(key) ?? 0) + 1);
      }
    }
    const turnOwners = new Set<string>();
    const nodeById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
    for (const edge of layout.graph.edges.filter((candidate) => candidate.kind === "slide")) {
      const points = [nodeById.get(edge.fromNodeId)!.point, ...edge.path];
      let turnCount = 0;
      for (let index = 1; index < points.length - 1; index += 1) {
        const incoming = directionBetween(points[index - 1]!, points[index]!);
        const outgoing = directionBetween(points[index]!, points[index + 1]!);
        if (incoming === outgoing) continue;
        turnCount += 1;
        const key = `${points[index]!.x},${points[index]!.y}`;
        expect(ownership.get(key), `${edge.id} turn ${key}`).toBe(1);
        turnOwners.add(key);
      }
      expect(turnCount, edge.id).toBeGreaterThanOrEqual(1);
    }

    let cornerCount = 0;
    let invertedGroupCount = 0;
    for (let y = 0; y < layout.map.height; y += 1) {
      for (let x = 0; x < layout.map.width; x += 1) {
        const tile = terrainAt(layout, x, y);
        if (tile.startsWith("ICE_CORNER_")) {
          cornerCount += 1;
          if (!socketCornerKeys.has(`${x},${y}`)) {
            expect(ownership.get(`${x},${y}`), `corner ${x},${y}`).toBe(1);
          }
        }
        if (
          x < layout.map.width - 1 &&
          y < layout.map.height - 1 &&
          tile === "ICE_CORNER_NW" &&
          terrainAt(layout, x + 1, y) === "ICE_CORNER_NE" &&
          terrainAt(layout, x, y + 1) === "ICE_CORNER_SW" &&
          terrainAt(layout, x + 1, y + 1) === "ICE_CORNER_SE"
        ) {
          invertedGroupCount += 1;
        }
      }
    }
    for (const origin of origins) {
      expect(
        INWARD_SPARKLE_PATTERN.some(({ dx, dy }) =>
          turnOwners.has(`${origin.x + dx},${origin.y + dy}`),
        ),
        `sparkle ${origin.x},${origin.y}`,
      ).toBe(true);
    }

    expect(origins).toHaveLength(layout.metrics.completeCornerGroups);
    expect(cornerCount).toBe(origins.length * 4 + socketCornerKeys.size);
    expect(invertedGroupCount).toBe(0);
  });

  it("disperses chips through winding quadrant routes instead of a center plus or grid", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const chipNodes = layout.graph.nodes.filter((node) => node.role === "chip");
    const centerCrossCount = chipNodes.filter(
      (node) => Math.abs(node.point.x - 49) <= 2 || Math.abs(node.point.y - 49) <= 2,
    ).length;
    const chipsByX = new Map<number, number>();
    const chipsByY = new Map<number, number>();
    for (const node of chipNodes) {
      chipsByX.set(node.point.x, (chipsByX.get(node.point.x) ?? 0) + 1);
      chipsByY.set(node.point.y, (chipsByY.get(node.point.y) ?? 0) + 1);
    }
    const turningEdges = layout.graph.edges.filter(
      (edge) => edge.kind === "slide" && edge.entryDir !== edge.exitDir,
    );

    expect(centerCrossCount).toBeLessThanOrEqual(12);
    expect(chipsByX.size).toBeGreaterThanOrEqual(24);
    expect(chipsByY.size).toBeGreaterThanOrEqual(24);
    expect(Math.max(...chipsByX.values())).toBeLessThanOrEqual(8);
    expect(Math.max(...chipsByY.values())).toBeLessThanOrEqual(8);
    expect(turningEdges.length).toBeGreaterThanOrEqual(70);
  });

  it("uses even local sparkles without imposing global rotational or reflection symmetry", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const chips = layout.graph.nodes
      .filter((node) => node.role === "chip")
      .map((node) => node.point);
    const sparkles = inwardSparkleOrigins(layout);
    const transforms = [
      (point: Readonly<{ x: number; y: number }>) => ({ x: 98 - point.x, y: 98 - point.y }),
      (point: Readonly<{ x: number; y: number }>) => ({ x: 98 - point.x, y: point.y }),
      (point: Readonly<{ x: number; y: number }>) => ({ x: point.x, y: 98 - point.y }),
    ];
    const bins = Array<number>(16).fill(0);
    for (const origin of sparkles) {
      const binX = Math.min(3, Math.floor(origin.x / 25));
      const binY = Math.min(3, Math.floor(origin.y / 25));
      const binIndex = binX + binY * 4;
      bins[binIndex] = (bins[binIndex] ?? 0) + 1;
    }

    for (const transform of transforms) {
      expect(coordinateSetOverlap(chips, transform)).toBeLessThan(0.65);
      expect(coordinateSetOverlap(sparkles, transform)).toBeLessThan(0.75);
    }
    expect(Math.min(...bins)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...bins) / Math.min(...bins)).toBeLessThan(3);
  });

  it("exports every physical semantic-stop route and none of them is straight", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const region = createProceduralRegion({
      board: { width: 99, height: 99 },
      mask: { kind: "rect", rect: { x: 0, y: 0, width: 99, height: 99 } },
    });
    const extracted = extractIceMazeGraph(layout.map, region, { chipSocketsOpen: true });
    const semanticByPoint = new Map(
      layout.graph.nodes.map((node) => [`${node.point.x},${node.point.y}`, node]),
    );
    const extractedNodeById = new Map(extracted.nodes.map((node) => [node.id, node]));
    const physicalSemanticEdges = extracted.edges.filter((edge) => {
      const from = extractedNodeById.get(edge.fromNodeId)!;
      const to = extractedNodeById.get(edge.toNodeId)!;
      return (
        semanticByPoint.has(`${from.point.x},${from.point.y}`) &&
        semanticByPoint.has(`${to.point.x},${to.point.y}`)
      );
    });
    const declaredDirectedKeys = new Set<string>();
    const graphNodeById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
    for (const edge of layout.graph.edges.filter((candidate) => candidate.kind === "slide")) {
      const from = graphNodeById.get(edge.fromNodeId)!.point;
      const to = graphNodeById.get(edge.toNodeId)!.point;
      declaredDirectedKeys.add(physicalEdgeKey(from, edge.entryDir, to, edge.path));
      declaredDirectedKeys.add(
        physicalEdgeKey(
          to,
          opposite(edge.exitDir),
          from,
          [from, ...edge.path.slice(0, -1)].reverse(),
        ),
      );
    }

    const physicalKeys = new Set(
      physicalSemanticEdges.map((edge) => {
        const from = extractedNodeById.get(edge.fromNodeId)!.point;
        const to = extractedNodeById.get(edge.toNodeId)!.point;
        const points = [from, ...edge.path];
        let turnCount = 0;
        for (let index = 1; index < points.length - 1; index += 1) {
          if (
            directionBetween(points[index - 1]!, points[index]!) !==
            directionBetween(points[index]!, points[index + 1]!)
          ) {
            turnCount += 1;
          }
        }
        expect(turnCount, edge.id).toBeGreaterThanOrEqual(1);
        return physicalEdgeKey(from, edge.entryDir, to, edge.path);
      }),
    );

    expect(declaredDirectedKeys).toEqual(physicalKeys);
  });

  it("builds an expanding route solution that collects every chip before the socket and exit", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const nodeById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
    const visitedRoles = layout.solution.nodeIds.map((nodeId) => nodeById.get(nodeId)?.role);
    const socketIndex = visitedRoles.indexOf("socket");
    const exitIndex = visitedRoles.indexOf("exit");

    expect(new Set(layout.solution.collectedChipNodeIds).size).toBe(layout.config.chipCount);
    expect(socketIndex).toBeGreaterThan(0);
    expect(exitIndex).toBeGreaterThan(socketIndex);
    expect(visitedRoles.slice(0, socketIndex)).not.toContain("exit");
    expect(layout.graph.chains).toHaveLength(DEFAULT_ISLIDE_GENERATOR_CONFIG.branchCount);
    expect(layout.graph.chains.filter((chain) => chain.kind === "loop")).toHaveLength(
      DEFAULT_ISLIDE_GENERATOR_CONFIG.loopCount,
    );
  });

  it("materializes every declared slide edge as the actual reversible ice run", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const nodeById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
    const region = createProceduralRegion({
      board: { width: layout.map.width, height: layout.map.height },
      mask: {
        kind: "rect",
        rect: { x: 0, y: 0, width: layout.map.width, height: layout.map.height },
      },
    });

    for (const edge of layout.graph.edges.filter((candidate) => candidate.kind === "slide")) {
      const from = nodeById.get(edge.fromNodeId)!;
      const to = nodeById.get(edge.toNodeId)!;
      const forward = simulateIceRun(layout.map, region, from.point, edge.entryDir, {
        chipSocketsOpen: true,
      });
      const reverse = simulateIceRun(layout.map, region, to.point, opposite(edge.exitDir), {
        chipSocketsOpen: true,
      });

      expect(forward.stopPoint, `${edge.id} forward`).toEqual(to.point);
      expect(reverse.stopPoint, `${edge.id} reverse`).toEqual(from.point);
    }
  });

  it("locks numeric controls while retaining seed as the sole deterministic input", () => {
    const baseline = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const alternateInput = {
      ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
      seed: "another-constellation",
      chipCount: 64,
      branchCount: 7,
      loopCount: 1,
      sparkleDensity: 42,
      routeSpread: 58,
      asymmetry: 84,
    };
    const adjusted = generateISlideLayout(alternateInput);
    const repeated = generateISlideLayout({
      ...alternateInput,
      chipCount: 160,
      branchCount: 4,
      loopCount: 0,
    });

    expect(adjusted.fingerprint).toBe(repeated.fingerprint);
    expect(adjusted.fingerprint).not.toBe(baseline.fingerprint);
    expect({ ...adjusted.config, chipCount: DEFAULT_ISLIDE_GENERATOR_CONFIG.chipCount }).toEqual({
      ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
      seed: alternateInput.seed,
    });
    expect(adjusted.config.chipCount).toBe(countTile(adjusted, "IC_CHIP"));
    expect(adjusted.graph).toEqual(repeated.graph);
    expect(flattenCellLayers(adjusted.map.tiles[49 + 49 * 99]!).mob?.tile).toBe("CHIP");
    expect(flattenCellLayers(adjusted.map.tiles[98 + 49 * 99]!).terrain.tile).toBe("EXIT");
  });
});
