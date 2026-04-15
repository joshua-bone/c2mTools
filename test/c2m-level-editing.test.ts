import { describe, expect, it } from "vitest";

import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import {
  getLineIndices,
  indexToPoint,
  normalizeRect,
  pointToIndex,
} from "../web/src/editor/boardGeometry.js";
import {
  connectWirePoints,
  clearMapToFloor,
  classifyBrushRole,
  copyMapRegion,
  disconnectWirePoints,
  paintMapCells,
  paintMapLine,
  pasteMapRegion,
  placeWireNode,
  resolveClipboardPreviewRect,
  resolveEyedropperBrushAtPoint,
  shiftMapWrap,
} from "../web/src/editor/levelEditing.js";
import type { MapJson, TileSpecJson } from "../src/c2m/mapCodec.js";

function createMap(width = 10, height = 10): MapJson {
  return createEmptyC2mDoc({ width, height }).map!;
}

function withTile(map: MapJson, point: { x: number; y: number }, tile: TileSpecJson): MapJson {
  const tiles = [...map.tiles];
  tiles[pointToIndex(point, map)] = tile;
  return {
    width: map.width,
    height: map.height,
    tiles,
  };
}

describe("c2m board geometry", () => {
  it("maps points to indices and back for variable-size maps", () => {
    const map = createMap(12, 18);
    const point = { x: 7, y: 11 };
    const index = pointToIndex(point, map);

    expect(index).toBe(139);
    expect(indexToPoint(index, map)).toEqual(point);
  });

  it("normalizes rects and line indices using the current map size", () => {
    const map = createMap(12, 18);

    expect(normalizeRect({ x: 9, y: 5 }, { x: 3, y: 1 }, map)).toEqual({
      x: 3,
      y: 1,
      width: 7,
      height: 5,
    });

    expect(getLineIndices({ x: 0, y: 0 }, { x: 3, y: 3 }, map)).toEqual([0, 13, 26, 39]);
  });
});

describe("c2m level editing", () => {
  it("classifies brushes using the shared core stack rules", () => {
    expect(classifyBrushRole("WATER")).toBe("terrain");
    expect(classifyBrushRole("BLUE_KEY")).toBe("item");
    expect(classifyBrushRole({ tile: "ANT", dir: "E" })).toBe("mob");
  });

  it("replaces only the item layer when painting a non-terrain item", () => {
    const startCell: TileSpecJson = {
      tile: "ANT",
      dir: "N",
      lower: {
        tile: "FIRE_BOOTS",
        lower: "FORCE_S",
      },
    };
    const map = withTile(createMap(), { x: 2, y: 2 }, startCell);
    const index = pointToIndex({ x: 2, y: 2 }, map);

    const nextMap = paintMapCells(map, [index], "BLUE_KEY");

    expect(nextMap.tiles[index]).toEqual({
      tile: "ANT",
      dir: "N",
      lower: {
        tile: "BLUE_KEY",
        lower: "FORCE_S",
      },
    });
  });

  it("replaces the whole cell when painting terrain", () => {
    const map = withTile(
      createMap(),
      { x: 2, y: 2 },
      {
        tile: "ANT",
        dir: "N",
        lower: {
          tile: "FIRE_BOOTS",
          lower: "FLOOR",
        },
      },
    );
    const index = pointToIndex({ x: 2, y: 2 }, map);

    const nextMap = paintMapCells(map, [index], "WATER");

    expect(nextMap.tiles[index]).toBe("WATER");
  });

  it("paints lines on variable-size maps", () => {
    const map = createMap(14, 11);

    const nextMap = paintMapLine(map, { x: 0, y: 0 }, { x: 3, y: 3 }, "WALL");

    expect(nextMap.tiles[0]).toBe("WALL");
    expect(nextMap.tiles[15]).toBe("WALL");
    expect(nextMap.tiles[30]).toBe("WALL");
    expect(nextMap.tiles[45]).toBe("WALL");
  });

  it("copies and pastes full cell stacks without collapsing them", () => {
    const sourceCell: TileSpecJson = {
      tile: "GHOST",
      dir: "W",
      lower: {
        tile: "BLUE_KEY",
        lower: "FORCE_S",
      },
    };
    let map = withTile(createMap(), { x: 1, y: 1 }, sourceCell);
    map = withTile(
      map,
      { x: 5, y: 5 },
      {
        tile: "ANT",
        dir: "N",
        lower: {
          tile: "FIRE_BOOTS",
          lower: "FLOOR",
        },
      },
    );
    const targetIndex = pointToIndex({ x: 5, y: 5 }, map);

    const clipboard = copyMapRegion(map, normalizeRect({ x: 1, y: 1 }, { x: 1, y: 1 }, map));
    const nextMap = pasteMapRegion(map, { x: 5, y: 5 }, clipboard);

    expect(nextMap.tiles[targetIndex]).toEqual(sourceCell);
  });

  it("resolves clipboard preview rects that clamp to the current map bounds", () => {
    const map = createMap(12, 11);

    expect(
      resolveClipboardPreviewRect(
        map,
        { x: 10, y: 9 },
        {
          width: 4,
          height: 3,
        },
      ),
    ).toEqual({
      x: 10,
      y: 9,
      width: 2,
      height: 2,
    });
  });

  it("eyedrops the top editable layer from a stacked cell", () => {
    const stackedCell: TileSpecJson = {
      tile: "NOT_ALLOWED_MARKER",
      lower: {
        tile: "ANT",
        dir: "W",
        lower: {
          tile: "BLUE_KEY",
          lower: "FLOOR",
        },
      },
    };
    const map = withTile(createMap(), { x: 3, y: 3 }, stackedCell);

    expect(resolveEyedropperBrushAtPoint(map, { x: 3, y: 3 })).toEqual("NOT_ALLOWED_MARKER");
    expect(resolveEyedropperBrushAtPoint(map, { x: 40, y: 40 })).toBeNull();
  });

  it("combines railroad track pieces when painting track variants onto existing railroad terrain", () => {
    const map = withTile(
      createMap(),
      { x: 4, y: 4 },
      {
        tile: "ANT",
        dir: "N",
        lower: {
          tile: "BLUE_KEY",
          lower: {
            tile: "RAILROAD_TRACK",
            modifiers: [
              {
                kind: "TRACKS",
                pieces: ["VERTICAL"],
                active: "V",
                entered: "N",
              },
            ],
          },
        },
      },
    );
    const index = pointToIndex({ x: 4, y: 4 }, map);

    const nextMap = paintMapCells(map, [index], {
      tile: "RAILROAD_TRACK",
      modifiers: [
        {
          kind: "TRACKS",
          pieces: ["TURN_NE"],
          active: "NE",
          entered: "N",
        },
      ],
    });

    expect(nextMap.tiles[index]).toEqual({
      tile: "ANT",
      dir: "N",
      lower: {
        tile: "BLUE_KEY",
        lower: {
          tile: "RAILROAD_TRACK",
          modifiers: [
            {
              kind: "TRACKS",
              pieces: ["TURN_NE", "VERTICAL"],
              active: "NE",
              entered: "N",
            },
          ],
        },
      },
    });
  });

  it("only applies the railroad switch brush on existing railroad terrain", () => {
    const plainMap = createMap();
    const nextPlainMap = paintMapCells(plainMap, [0], {
      tile: "RAILROAD_TRACK",
      modifiers: [{ kind: "TRACKS", pieces: ["SWITCH"], active: "V", entered: "N" }],
    });
    expect(nextPlainMap).toBe(plainMap);

    const railroadMap = withTile(
      plainMap,
      { x: 0, y: 0 },
      {
        tile: "RAILROAD_TRACK",
        modifiers: [{ kind: "TRACKS", pieces: ["VERTICAL"], active: "V", entered: "N" }],
      },
    );
    expect(
      paintMapCells(railroadMap, [0], {
        tile: "RAILROAD_TRACK",
        modifiers: [{ kind: "TRACKS", pieces: ["SWITCH"], active: "H", entered: "E" }],
      }).tiles[0],
    ).toEqual({
      tile: "RAILROAD_TRACK",
      modifiers: [{ kind: "TRACKS", pieces: ["VERTICAL", "SWITCH"], active: "V", entered: "N" }],
    });
  });

  it("stacks thin walls instead of replacing the existing overlay", () => {
    const map = withTile(
      createMap(),
      { x: 1, y: 1 },
      {
        tile: "THINWALL_CANOPY",
        thinWallCanopy: { walls: ["N"], canopy: false },
        lower: "FLOOR",
      },
    );

    expect(
      paintMapCells(map, [pointToIndex({ x: 1, y: 1 }, map)], {
        tile: "THINWALL_CANOPY",
        thinWallCanopy: { walls: ["E"], canopy: false },
        lower: "FLOOR",
      }).tiles[pointToIndex({ x: 1, y: 1 }, map)],
    ).toEqual({
      tile: "THINWALL_CANOPY",
      thinWallCanopy: { walls: ["N", "E"], canopy: false },
      lower: "FLOOR",
    });
  });

  it("places and connects explicit wire nodes on wireable terrain", () => {
    const map = createMap();
    const withNode = placeWireNode(map, { x: 2, y: 2 });
    const index = pointToIndex({ x: 2, y: 2 }, map);

    expect(withNode.tiles[index]).toEqual({
      tile: "FLOOR",
      modifiers: [{ kind: "WIRES", wires: [], tunnels: [] }],
    });

    const connected = connectWirePoints(withNode, { x: 2, y: 2 }, { x: 3, y: 2 });
    expect(connected.tiles[index]).toEqual({
      tile: "FLOOR",
      modifiers: [{ kind: "WIRES", wires: ["E"], tunnels: [] }],
    });
    expect(connected.tiles[pointToIndex({ x: 3, y: 2 }, map)]).toEqual({
      tile: "FLOOR",
      modifiers: [{ kind: "WIRES", wires: ["W"], tunnels: [] }],
    });
  });

  it("disconnects wire links but keeps explicit wire nodes in place", () => {
    const map = connectWirePoints(
      placeWireNode(placeWireNode(createMap(), { x: 2, y: 2 }), { x: 3, y: 2 }),
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    );
    const disconnected = disconnectWirePoints(map, { x: 2, y: 2 }, { x: 3, y: 2 });

    expect(disconnected.tiles[pointToIndex({ x: 2, y: 2 }, disconnected)]).toEqual({
      tile: "FLOOR",
      modifiers: [{ kind: "WIRES", wires: [], tunnels: [] }],
    });
    expect(disconnected.tiles[pointToIndex({ x: 3, y: 2 }, disconnected)]).toEqual({
      tile: "FLOOR",
      modifiers: [{ kind: "WIRES", wires: [], tunnels: [] }],
    });
  });

  it("rejects wire connections that violate logic-gate direction rules", () => {
    const map = withTile(
      createMap(),
      { x: 2, y: 2 },
      {
        tile: "LOGIC_GATE",
        modifiers: [{ kind: "LOGIC", gate: "AND", facing: "E" }],
      },
    );

    expect(connectWirePoints(map, { x: 2, y: 2 }, { x: 1, y: 2 })).toBe(map);

    expect(
      connectWirePoints(map, { x: 2, y: 2 }, { x: 3, y: 2 }).tiles[
        pointToIndex({ x: 2, y: 2 }, map)
      ],
    ).toEqual({
      tile: "LOGIC_GATE",
      modifiers: [
        { kind: "WIRES", wires: ["N", "E", "S"], tunnels: [] },
        { kind: "LOGIC", gate: "AND", facing: "E" },
      ],
    });
  });

  it("does not remove required logic-gate wires", () => {
    const map = withTile(
      createMap(),
      { x: 2, y: 2 },
      {
        tile: "LOGIC_GATE",
        modifiers: [
          { kind: "WIRES", wires: ["N", "E", "S"], tunnels: [] },
          { kind: "LOGIC", gate: "AND", facing: "E" },
        ],
      },
    );

    expect(
      disconnectWirePoints(map, { x: 2, y: 2 }, { x: 3, y: 2 }).tiles[
        pointToIndex({ x: 2, y: 2 }, map)
      ],
    ).toEqual({
      tile: "LOGIC_GATE",
      modifiers: [
        { kind: "WIRES", wires: ["N", "E", "S"], tunnels: [] },
        { kind: "LOGIC", gate: "AND", facing: "E" },
      ],
    });
  });

  it("does not remove wires required by wire tunnels", () => {
    let map = withTile(
      createMap(),
      { x: 2, y: 2 },
      {
        tile: "FLOOR",
        modifiers: [{ kind: "WIRES", wires: ["E"], tunnels: ["E"] }],
      },
    );
    map = connectWirePoints(placeWireNode(map, { x: 3, y: 2 }), { x: 2, y: 2 }, { x: 3, y: 2 });

    expect(
      disconnectWirePoints(map, { x: 2, y: 2 }, { x: 3, y: 2 }).tiles[
        pointToIndex({ x: 2, y: 2 }, map)
      ],
    ).toEqual({
      tile: "FLOOR",
      modifiers: [{ kind: "WIRES", wires: ["E"], tunnels: ["E"] }],
    });
  });

  it("wrap-shifts maps without changing their dimensions", () => {
    let map = withTile(createMap(10, 10), { x: 0, y: 0 }, "WATER");
    map = withTile(map, { x: 9, y: 9 }, "FIRE");

    const shifted = shiftMapWrap(map, 1, 1);

    expect(shifted.width).toBe(10);
    expect(shifted.height).toBe(10);
    expect(shifted.tiles[pointToIndex({ x: 1, y: 1 }, shifted)]).toBe("WATER");
    expect(shifted.tiles[pointToIndex({ x: 0, y: 0 }, shifted)]).toBe("FIRE");
  });

  it("clears the entire map to floor tiles", () => {
    let map = withTile(createMap(10, 10), { x: 0, y: 0 }, "WATER");
    map = withTile(
      map,
      { x: 4, y: 4 },
      {
        tile: "ANT",
        dir: "N",
        lower: {
          tile: "BLUE_KEY",
          lower: "FLOOR",
        },
      },
    );

    const cleared = clearMapToFloor(map);

    expect(cleared.tiles.every((tile) => tile === "FLOOR")).toBe(true);
    expect(cleared.width).toBe(map.width);
    expect(cleared.height).toBe(map.height);
  });
});
