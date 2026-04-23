import { describe, expect, it } from "vitest";

import { buildCellFromLayers } from "../src/c2m/cellStack.js";
import type { MapJson, TileSpecJson } from "../src/c2m/mapCodec.js";
import { createProceduralRegion } from "../procedural_generation/ice_maze.js";
import {
  buildReciprocalIceMazeGraph,
  extractIceMazeGraph,
  simulateIceRun,
} from "../procedural_generation/ice_maze_graph.js";

const TILE_BY_SYMBOL: Readonly<Record<string, TileSpecJson>> = Object.freeze({
  "#": "WALL",
  ".": "FLOOR",
  I: "ICE",
  "1": "ICE_CORNER_NW",
  "2": "ICE_CORNER_NE",
  "3": "ICE_CORNER_SE",
  "4": "ICE_CORNER_SW",
  s: "FLOOR",
  e: "FLOOR",
});

function createMapFromAscii(rows: ReadonlyArray<string>): MapJson {
  const width = rows[0]!.length;
  if (width === 0) {
    throw new Error("Test map rows must not be empty");
  }

  for (const row of rows) {
    if (row.length !== width) {
      throw new Error("Test map rows must all have the same width");
    }
  }

  const tiles: TileSpecJson[] = [];
  for (const row of rows) {
    for (const symbol of row) {
      const tile = TILE_BY_SYMBOL[symbol];
      if (!tile) {
        throw new Error(`Unknown test map symbol ${JSON.stringify(symbol)}`);
      }
      tiles.push(tile);
    }
  }

  return {
    width,
    height: rows.length,
    tiles,
  };
}

function createMapWithChipAndExit(): MapJson {
  return {
    width: 7,
    height: 3,
    tiles: [
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      buildCellFromLayers({
        terrain: { tile: "FLOOR" },
        item: { tile: "IC_CHIP" },
      }),
      "ICE",
      "ICE",
      "ICE",
      "EXIT",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
      "WALL",
    ],
  };
}

describe("ice maze graph extraction", () => {
  it("simulates a straight run across ice until Chip reaches floor", () => {
    const map = createMapFromAscii(["#######", "#sIIIe#", "#######"]);
    const region = createProceduralRegion({
      board: { width: map.width, height: map.height },
      mask: {
        kind: "rect",
        rect: { x: 0, y: 0, width: map.width, height: map.height },
      },
      anchors: [
        { id: "entry", kind: "entry", point: { x: 1, y: 1 } },
        { id: "exit", kind: "exit", point: { x: 5, y: 1 } },
      ],
    });

    const result = simulateIceRun(map, region, { x: 1, y: 1 }, "E");

    expect(result).toEqual({
      startPoint: { x: 1, y: 1 },
      startDir: "E",
      path: [
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
        { x: 5, y: 1 },
      ],
      termination: "stopped",
      encounteredSliding: true,
      stopPoint: { x: 5, y: 1 },
      stopDir: "E",
    });
  });

  it("simulates a reversible bend using a single ice corner", () => {
    const map = createMapFromAscii(["#####", "#sI2#", "###I#", "###e#", "#####"]);
    const region = createProceduralRegion({
      board: { width: map.width, height: map.height },
      mask: {
        kind: "rect",
        rect: { x: 0, y: 0, width: map.width, height: map.height },
      },
      anchors: [
        { id: "entry", kind: "entry", point: { x: 1, y: 1 } },
        { id: "exit", kind: "exit", point: { x: 3, y: 3 } },
      ],
    });

    expect(simulateIceRun(map, region, { x: 1, y: 1 }, "E")).toEqual({
      startPoint: { x: 1, y: 1 },
      startDir: "E",
      path: [
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
      ],
      termination: "stopped",
      encounteredSliding: true,
      stopPoint: { x: 3, y: 3 },
      stopDir: "S",
    });

    expect(simulateIceRun(map, region, { x: 3, y: 3 }, "N")).toEqual({
      startPoint: { x: 3, y: 3 },
      startDir: "N",
      path: [
        { x: 3, y: 2 },
        { x: 3, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
      ],
      termination: "stopped",
      encounteredSliding: true,
      stopPoint: { x: 1, y: 1 },
      stopDir: "W",
    });
  });

  it("detects ice loops instead of inventing a stop point", () => {
    const map = createMapFromAscii(["#####", "#12##", "#43##", "#####"]);
    const region = createProceduralRegion({
      board: { width: map.width, height: map.height },
      mask: {
        kind: "rect",
        rect: { x: 0, y: 0, width: map.width, height: map.height },
      },
      anchors: [{ id: "entry", kind: "entry", point: { x: 1, y: 1 } }],
    });

    const result = simulateIceRun(map, region, { x: 1, y: 1 }, "E");

    expect(result.termination).toBe("loop");
    expect(result.encounteredSliding).toBe(true);
    expect(result.loopPoint).toEqual({ x: 2, y: 1 });
    expect(result.loopDir).toBe("S");
    expect(result.path).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("extracts only real stop nodes from a pure-ice corridor and exposes the reciprocal graph", () => {
    const map = createMapFromAscii(["#######", "#IIIII#", "#######"]);
    const region = createProceduralRegion({
      board: { width: map.width, height: map.height },
      mask: {
        kind: "rect",
        rect: { x: 0, y: 0, width: map.width, height: map.height },
      },
    });

    const graph = extractIceMazeGraph(map, region);
    const reciprocal = buildReciprocalIceMazeGraph(graph);

    expect(graph.nodes).toEqual([
      {
        id: "node-1-1",
        point: { x: 1, y: 1 },
        role: "leaf",
      },
      {
        id: "node-5-1",
        point: { x: 5, y: 1 },
        role: "leaf",
      },
    ]);
    expect(graph.edges).toEqual([
      {
        id: "edge-node-1-1-E",
        fromNodeId: "node-1-1",
        toNodeId: "node-5-1",
        entryDir: "E",
        exitDir: "E",
        path: [
          { x: 2, y: 1 },
          { x: 3, y: 1 },
          { x: 4, y: 1 },
          { x: 5, y: 1 },
        ],
      },
      {
        id: "edge-node-5-1-W",
        fromNodeId: "node-5-1",
        toNodeId: "node-1-1",
        entryDir: "W",
        exitDir: "W",
        path: [
          { x: 4, y: 1 },
          { x: 3, y: 1 },
          { x: 2, y: 1 },
          { x: 1, y: 1 },
        ],
      },
    ]);
    expect(reciprocal.edges).toEqual([
      {
        id: "reciprocal-node-1-1-node-5-1",
        nodeIds: ["node-1-1", "node-5-1"],
        forwardEdgeIds: ["edge-node-1-1-E"],
        reverseEdgeIds: ["edge-node-5-1-W"],
      },
    ]);
  });

  it("classifies chip and exit leaves from an extracted ice graph", () => {
    const map = createMapWithChipAndExit();
    const region = createProceduralRegion({
      board: { width: map.width, height: map.height },
      mask: {
        kind: "rect",
        rect: { x: 0, y: 0, width: map.width, height: map.height },
      },
    });

    const graph = extractIceMazeGraph(map, region);

    expect(graph.nodes).toEqual([
      {
        id: "node-1-1",
        point: { x: 1, y: 1 },
        role: "chip",
      },
      {
        id: "node-5-1",
        point: { x: 5, y: 1 },
        role: "exit",
      },
    ]);
    expect(graph.edges.map((edge) => edge.id)).toEqual(["edge-node-1-1-E", "edge-node-5-1-W"]);
  });
});
