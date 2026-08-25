import { describe, expect, it } from "vitest";

import { flattenCellLayers } from "../src/c2m/cellStack.js";
import { createProceduralRegion } from "../procedural_generation/ice_maze.js";
import { simulateIceRun } from "../procedural_generation/ice_maze_graph.js";
import {
  DEFAULT_ISLIDE_GENERATOR_CONFIG,
  generateISlideLayout,
} from "../procedural_generation/islide_generator.js";
import type { Dir } from "../src/c2m/mapCodec.js";

function opposite(dir: Dir): Dir {
  return ({ N: "S", E: "W", S: "N", W: "E" } as const)[dir];
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

describe("deterministic I SLIDE generator", () => {
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

  it("preserves the source landmarks, local sparkle rhythm, and requested chip count", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const centerIndex = 49 + 49 * layout.map.width;

    expect(flattenCellLayers(layout.map.tiles[centerIndex]!).mob?.tile).toBe("CHIP");
    expect(countTile(layout, "IC_CHIP")).toBe(99);
    expect(countTile(layout, "CHIP_SOCKET")).toBe(1);
    expect(countTile(layout, "EXIT")).toBe(1);
    expect(layout.metrics.completeCornerGroups).toBeGreaterThanOrEqual(180);
    expect(layout.metrics.completeCornerGroups).toBeLessThanOrEqual(270);
    expect(layout.metrics.quadrantChipCounts.every((count) => count >= 20)).toBe(true);
    expect(layout.metrics.routeCrossings).toBeGreaterThan(0);
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
    expect(islandCells.every((cell) => cell.terrain.tile === "FLOOR")).toBe(true);
    expect(layout.graph.nodes.filter((node) => node.role === "hub")).toHaveLength(80);
    expect(new Set(launchPoints.map((point) => `${point.x},${point.y}`)).size).toBe(8);
    expect(
      launchPoints.every(
        (point) => point.x === 45 || point.x === 53 || point.y === 45 || point.y === 53,
      ),
    ).toBe(true);
    expect(9 / layout.map.width).toBeGreaterThan(0.09);
  });

  it("frames the socket with the source split sparkle and gives it one exit arm", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const terrainAt = (x: number, y: number): string =>
      flattenCellLayers(layout.map.tiles[x + y * layout.map.width]!).terrain.tile;
    const splitSocketCenters = [];
    for (let y = 0; y < layout.map.height - 1; y += 1) {
      for (let x = 1; x < layout.map.width - 1; x += 1) {
        if (
          terrainAt(x, y) === "CHIP_SOCKET" &&
          terrainAt(x - 1, y) === "ICE_CORNER_NW" &&
          terrainAt(x + 1, y) === "ICE_CORNER_NE" &&
          terrainAt(x - 1, y + 1) === "ICE_CORNER_SW" &&
          terrainAt(x, y + 1) === "ICE" &&
          terrainAt(x + 1, y + 1) === "ICE_CORNER_SE"
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
    expect(runFromSocket("E").stopPoint).toEqual({ x: 49, y: 31 });
    expect(runFromSocket("W").stopPoint).toEqual({ x: 49, y: 31 });
    expect(runFromSocket("N").stopPoint).toEqual({ x: 98, y: 49 });
    expect(runFromSocket("S").stopPoint).toEqual({ x: 49, y: 45 });
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

  it("builds an expanding route solution that collects every chip before the socket and exit", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const nodeById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
    const visitedRoles = layout.solution.nodeIds.map((nodeId) => nodeById.get(nodeId)?.role);
    const socketIndex = visitedRoles.indexOf("socket");
    const exitIndex = visitedRoles.indexOf("exit");

    expect(new Set(layout.solution.collectedChipNodeIds).size).toBe(99);
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

  it("lets seed and sliders change the artifact without changing fixed landmarks", () => {
    const baseline = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const adjusted = generateISlideLayout({
      ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
      seed: "another-constellation",
      chipCount: 64,
      branchCount: 7,
      loopCount: 1,
      sparkleDensity: 42,
      routeSpread: 58,
      asymmetry: 84,
    });

    expect(adjusted.fingerprint).not.toBe(baseline.fingerprint);
    expect(countTile(adjusted, "IC_CHIP")).toBe(64);
    expect(adjusted.metrics.completeCornerGroups).toBeLessThan(
      baseline.metrics.completeCornerGroups,
    );
    expect(flattenCellLayers(adjusted.map.tiles[49 + 49 * 99]!).mob?.tile).toBe("CHIP");
    expect(flattenCellLayers(adjusted.map.tiles[98 + 49 * 99]!).terrain.tile).toBe("EXIT");
  });
});
