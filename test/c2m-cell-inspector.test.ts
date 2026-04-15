import { describe, expect, it } from "vitest";

import type { MapJson, TileSpecJson } from "../src/c2m/mapCodec.js";
import { pointToIndex } from "../web/src/editor/boardGeometry.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import {
  resolveRequiredWireDirections,
  resolveWireableDirections,
  setTileModifier,
  updateCellLayerAtPoint,
} from "../web/src/editor/cellInspector.js";

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

  it("resolves wireable directions for the supported terrain set", () => {
    expect(resolveWireableDirections({ tile: "TRAP" })).toEqual(["N", "E", "S", "W"]);
    expect(resolveWireableDirections({ tile: "TRANSMOGRIFIER" })).toEqual(["N", "E", "S", "W"]);
    expect(resolveWireableDirections({ tile: "FORCE_E" })).toEqual(["N", "E", "S", "W"]);
    expect(resolveWireableDirections({ tile: "FLAME_JET_ON" })).toEqual(["N", "E", "S", "W"]);
    expect(resolveWireableDirections({ tile: "SWIVEL_DOOR_SE" })).toEqual(["N", "E", "S", "W"]);
    expect(resolveWireableDirections({ tile: "CLONE_MACHINE" })).toEqual(["N", "E", "S", "W"]);
  });

  it("only allows railroad wires when a switch piece is present", () => {
    expect(
      resolveWireableDirections({
        tile: "RAILROAD_TRACK",
        modifiers: [{ kind: "TRACKS", pieces: ["VERTICAL"], active: "V", entered: "N" }],
      }),
    ).toEqual([]);

    expect(
      resolveWireableDirections({
        tile: "RAILROAD_TRACK",
        modifiers: [{ kind: "TRACKS", pieces: ["VERTICAL", "SWITCH"], active: "V", entered: "N" }],
      }),
    ).toEqual(["N", "E", "S", "W"]);
  });

  it("applies logic-gate direction rules from the gate type and facing", () => {
    expect(
      resolveWireableDirections({
        tile: "LOGIC_GATE",
        modifiers: [{ kind: "LOGIC", gate: "AND", facing: "E" }],
      }),
    ).toEqual(["N", "E", "S"]);

    expect(
      resolveWireableDirections({
        tile: "LOGIC_GATE",
        modifiers: [{ kind: "LOGIC", gate: "INVERTER", facing: "S" }],
      }),
    ).toEqual(["N", "S"]);

    expect(
      resolveWireableDirections({
        tile: "LOGIC_GATE",
        modifiers: [{ kind: "LOGIC", gate: "COUNTER", counterValue: 4 }],
      }),
    ).toEqual(["N", "E", "S", "W"]);
  });

  it("treats logic-gate connection directions as required wires", () => {
    expect(
      resolveRequiredWireDirections({
        tile: "LOGIC_GATE",
        modifiers: [{ kind: "LOGIC", gate: "AND", facing: "E" }],
      }),
    ).toEqual(["N", "E", "S"]);

    expect(
      resolveRequiredWireDirections({
        tile: "LOGIC_GATE",
        modifiers: [{ kind: "LOGIC", gate: "INVERTER", facing: "S" }],
      }),
    ).toEqual(["N", "S"]);

    expect(resolveRequiredWireDirections({ tile: "FLOOR" })).toEqual([]);
  });
});
