import { describe, expect, it } from "vitest";

import {
  createProceduralRegion,
  getProceduralRegionAnchor,
  regionContainsPoint,
  regionReservesPoint,
  serializeIceMazeGraphDebug,
  serializeProceduralRegionDebug,
  type ExtractedIceSlideGraph,
} from "../procedural_generation/ice_maze.js";
import {
  IRREGULAR_REGION_FIXTURE,
  SMALL_RECT_REGION_FIXTURE,
  getIceMazeRegionFixtures,
} from "../procedural_generation/ice_maze_fixtures.js";

describe("ice maze region contract", () => {
  it("builds a smaller-than-board rectangular fixture region", () => {
    expect(SMALL_RECT_REGION_FIXTURE.board).toEqual({ width: 10, height: 10 });
    expect(SMALL_RECT_REGION_FIXTURE.bounds).toEqual({ x: 2, y: 3, width: 4, height: 4 });
    expect(SMALL_RECT_REGION_FIXTURE.allowedPoints).toHaveLength(16);
    expect(SMALL_RECT_REGION_FIXTURE.reservedPoints).toEqual([{ x: 3, y: 4 }]);
    expect(SMALL_RECT_REGION_FIXTURE.anchors).toEqual([
      {
        id: "entry",
        kind: "entry",
        point: { x: 2, y: 3 },
      },
      {
        id: "exit",
        kind: "exit",
        point: { x: 4, y: 6 },
      },
    ]);

    expect(regionContainsPoint(SMALL_RECT_REGION_FIXTURE, { x: 2, y: 3 })).toBe(true);
    expect(regionContainsPoint(SMALL_RECT_REGION_FIXTURE, { x: 1, y: 3 })).toBe(false);
    expect(regionReservesPoint(SMALL_RECT_REGION_FIXTURE, { x: 3, y: 4 })).toBe(true);
    expect(regionReservesPoint(SMALL_RECT_REGION_FIXTURE, { x: 2, y: 3 })).toBe(false);
    expect(getProceduralRegionAnchor(SMALL_RECT_REGION_FIXTURE, "entry")?.point).toEqual({
      x: 2,
      y: 3,
    });
  });

  it("parses an irregular masked region fixture", () => {
    expect(IRREGULAR_REGION_FIXTURE.board).toEqual({ width: 16, height: 12 });
    expect(IRREGULAR_REGION_FIXTURE.bounds).toEqual({ x: 5, y: 2, width: 4, height: 4 });
    expect(IRREGULAR_REGION_FIXTURE.allowedPoints).toHaveLength(11);
    expect(IRREGULAR_REGION_FIXTURE.reservedPoints).toEqual([{ x: 6, y: 4 }]);
    expect(IRREGULAR_REGION_FIXTURE.anchors).toEqual([
      {
        id: "entry",
        kind: "entry",
        point: { x: 6, y: 2 },
      },
      {
        id: "exit",
        kind: "exit",
        point: { x: 8, y: 5 },
      },
    ]);
    expect(getIceMazeRegionFixtures()).toEqual([
      SMALL_RECT_REGION_FIXTURE,
      IRREGULAR_REGION_FIXTURE,
    ]);
  });

  it("rejects anchors that lie outside the region mask", () => {
    expect(() =>
      createProceduralRegion({
        board: { width: 8, height: 8 },
        mask: {
          kind: "rect",
          rect: { x: 1, y: 1, width: 3, height: 3 },
        },
        anchors: [
          {
            id: "entry",
            kind: "entry",
            point: { x: 0, y: 0 },
          },
        ],
      }),
    ).toThrow('Anchor "entry" at (0,0) must lie within the region mask');
  });

  it("rejects reserved points that lie outside the region mask", () => {
    expect(() =>
      createProceduralRegion({
        board: { width: 8, height: 8 },
        mask: {
          kind: "ascii",
          origin: { x: 2, y: 2 },
          rows: ["..", ".."],
        },
        reservedPoints: [{ x: 1, y: 1 }],
      }),
    ).toThrow("Reserved point (1,1) must lie within the region mask");
  });

  it("rejects malformed ascii masks", () => {
    expect(() =>
      createProceduralRegion({
        board: { width: 8, height: 8 },
        mask: {
          kind: "ascii",
          rows: ["...", ".."],
        },
      }),
    ).toThrow("ASCII region mask rows must all have the same width");
  });

  it("renders deterministic debug output for regions and graphs", () => {
    expect(serializeProceduralRegionDebug(SMALL_RECT_REGION_FIXTURE)).toBe(
      [
        "small-rect-room board=10x10 bounds=(2,3) 4x4 allowed=16 reserved=1 anchors=2",
        "S...",
        ".R..",
        "....",
        "..E.",
      ].join("\n"),
    );

    const graph: ExtractedIceSlideGraph = {
      region: SMALL_RECT_REGION_FIXTURE,
      nodes: [
        {
          id: "entry-node",
          point: { x: 2, y: 3 },
          role: "start",
          anchorId: "entry",
        },
        {
          id: "exit-node",
          point: { x: 4, y: 6 },
          role: "exit",
          anchorId: "exit",
        },
      ],
      edges: [
        {
          id: "slide-1",
          fromNodeId: "entry-node",
          toNodeId: "exit-node",
          entryDir: "E",
          exitDir: "S",
          path: [
            { x: 3, y: 3 },
            { x: 4, y: 3 },
            { x: 4, y: 4 },
            { x: 4, y: 5 },
          ],
        },
      ],
      exitCut: {
        socketNodeIds: ["socket-1"],
        boundaryNodeIds: ["entry-node"],
        exitRegionNodeIds: ["exit-node"],
        explorableNodeIds: ["entry-node"],
      },
    };

    expect(serializeIceMazeGraphDebug(graph)).toBe(
      [
        "small-rect-room board=10x10 bounds=(2,3) 4x4 allowed=16 reserved=1 anchors=2",
        "S...",
        ".R..",
        "....",
        "..E.",
        "",
        "nodes:",
        "entry-node start @ (2,3) anchor=entry",
        "exit-node exit @ (4,6) anchor=exit",
        "",
        "edges:",
        "slide-1 entry-node->exit-node E/S len=4",
        "",
        "exit-cut:",
        "sockets=socket-1",
        "boundary=entry-node",
        "exit-region=exit-node",
        "explorable=entry-node",
      ].join("\n"),
    );
  });
});
