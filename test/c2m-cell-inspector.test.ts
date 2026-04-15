import { describe, expect, it } from "vitest";

import type { MapJson, TileSpecJson } from "../src/c2m/mapCodec.js";
import { pointToIndex } from "../web/src/editor/boardGeometry.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { setTileModifier, updateCellLayerAtPoint } from "../web/src/editor/cellInspector.js";

function createMap(): MapJson {
  return createEmptyC2mDoc({ width: 10, height: 10 }).map!;
}

describe("c2m cell inspector helpers", () => {
  it("updates a modifier-heavy terrain layer without dropping higher layers", () => {
    const cell: TileSpecJson = {
      tile: "ANT",
      dir: "E",
      lower: {
        tile: "BLUE_KEY",
        lower: "FLOOR",
      },
    };
    const map = createMap();
    const point = { x: 2, y: 2 };
    const tiles = [...map.tiles];
    tiles[pointToIndex(point, map)] = cell;

    const nextMap = updateCellLayerAtPoint(
      {
        width: map.width,
        height: map.height,
        tiles,
      },
      point,
      "terrain",
      (tile) =>
        setTileModifier(tile, "WIRES", {
          kind: "WIRES",
          wires: ["N", "E"],
          tunnels: ["S"],
        }),
    );

    expect(nextMap.tiles[pointToIndex(point, nextMap)]).toEqual({
      tile: "ANT",
      dir: "E",
      lower: {
        tile: "BLUE_KEY",
        lower: {
          tile: "FLOOR",
          modifiers: [{ kind: "WIRES", wires: ["N", "E"], tunnels: ["S"] }],
        },
      },
    });
  });
});
