import { describe, expect, it } from "vitest";

import type { TileSpecJson } from "../src/c2m/mapCodec.js";
import {
  buildHoverCellSummary,
  createBoardEditorStatusStore,
} from "../web/src/boardEditorStatus.js";
import { pointToIndex } from "../web/src/editor/boardGeometry.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";

function createMap() {
  return createEmptyC2mDoc({ width: 10, height: 10 }).map!;
}

describe("board editor status", () => {
  it("tracks board status updates and resets", () => {
    const store = createBoardEditorStatusStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.update({
      boardZoom: 1.5,
      boardPan: { x: 24, y: -18 },
      hoverPoint: { x: 2, y: 3 },
      isPanning: true,
    });

    expect(store.getSnapshot()).toMatchObject({
      boardZoom: 1.5,
      boardPan: { x: 24, y: -18 },
      hoverPoint: { x: 2, y: 3 },
      isPanning: true,
    });
    expect(notifications).toBe(1);

    store.reset();

    expect(store.getSnapshot()).toEqual({
      boardZoom: 1,
      boardPan: { x: 0, y: 0 },
      hoverPoint: null,
      hoverCellSummary: null,
      isPanning: false,
    });
    expect(notifications).toBe(2);

    unsubscribe();
  });

  it("builds ordered hover summaries for full C2M cell stacks", () => {
    const baseMap = createMap();
    const cell: TileSpecJson = {
      tile: "THINWALL_CANOPY",
      thinWallCanopy: {
        walls: ["N", "E"],
        canopy: true,
      },
      lower: {
        tile: "NOT_ALLOWED_MARKER",
        lower: {
          tile: "ANT",
          dir: "E",
          lower: {
            tile: "BLUE_KEY",
            lower: "FORCE_S",
          },
        },
      },
    };
    const point = { x: 2, y: 2 };
    const tiles = [...baseMap.tiles];
    tiles[pointToIndex(point, baseMap)] = cell;
    const map = {
      width: baseMap.width,
      height: baseMap.height,
      tiles,
    };

    const summary = buildHoverCellSummary(map, point);

    expect(summary?.index).toBe(22);
    expect(summary?.layers.map((layer) => layer.role)).toEqual([
      "thinWalls",
      "noSign",
      "mob",
      "item",
      "terrain",
    ]);
    expect(summary?.layers.map((layer) => layer.tileName)).toEqual([
      "THINWALL_CANOPY",
      "NOT_ALLOWED_MARKER",
      "ANT",
      "BLUE_KEY",
      "FORCE_S",
    ]);
    expect(summary?.layers[0]?.label).toMatch(/Thinwall Canopy/i);
    expect(summary?.layers[2]?.label).toMatch(/Ant \(E\)/i);
  });
});
