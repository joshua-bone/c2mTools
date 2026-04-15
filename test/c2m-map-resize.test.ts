import { describe, expect, it } from "vitest";

import type { MapJson } from "../src/c2m/mapCodec.js";
import { pointToIndex } from "../web/src/editor/boardGeometry.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { parseMapResizeDraft, resizeMap } from "../web/src/editor/mapResize.js";

function createMap(width: number, height: number): MapJson {
  return createEmptyC2mDoc({ width, height }).map!;
}

function setTile(
  map: MapJson,
  point: { x: number; y: number },
  tile: MapJson["tiles"][number],
): MapJson {
  const tiles = [...map.tiles];
  tiles[pointToIndex(point, map)] = tile;
  return {
    width: map.width,
    height: map.height,
    tiles,
  };
}

describe("c2m map resize helpers", () => {
  it("expands from the northwest anchor and fills new cells with floor", () => {
    let map = createMap(10, 10);
    map = setTile(map, { x: 0, y: 0 }, "WALL");
    map = setTile(map, { x: 9, y: 9 }, "WATER");

    const nextMap = resizeMap(map, {
      width: 12,
      height: 11,
      anchor: "NW",
    });

    expect(nextMap.width).toBe(12);
    expect(nextMap.height).toBe(11);
    expect(nextMap.tiles[pointToIndex({ x: 0, y: 0 }, nextMap)]).toBe("WALL");
    expect(nextMap.tiles[pointToIndex({ x: 9, y: 9 }, nextMap)]).toBe("WATER");
    expect(nextMap.tiles[pointToIndex({ x: 11, y: 10 }, nextMap)]).toBe("FLOOR");
  });

  it("crops toward the southeast anchor when shrinking", () => {
    let map = createMap(12, 12);
    map = setTile(map, { x: 11, y: 11 }, "EXIT");
    map = setTile(map, { x: 0, y: 0 }, "WALL");

    const nextMap = resizeMap(map, {
      width: 10,
      height: 10,
      anchor: "SE",
    });

    expect(nextMap.tiles[pointToIndex({ x: 9, y: 9 }, nextMap)]).toBe("EXIT");
    expect(nextMap.tiles[pointToIndex({ x: 0, y: 0 }, nextMap)]).toBe("FLOOR");
  });

  it("enforces the configured size bounds while parsing drafts", () => {
    expect(() =>
      parseMapResizeDraft({
        width: "9",
        height: "10",
        anchor: "NW",
      }),
    ).toThrow(/between 10 and 100 inclusive/);
  });
});
