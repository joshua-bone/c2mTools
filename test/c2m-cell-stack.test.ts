import { describe, expect, it } from "vitest";

import {
  buildCellFromLayers,
  C2M_PAINTABLE_TILE_NAMES,
  classifyTileLayer,
  flattenCellLayers,
  getBrushRole,
  replaceCellForBrush,
} from "../src/c2m/cellStack.js";
import type { TileSpecJson } from "../src/c2m/mapCodec.js";

describe("c2m cell stack helpers", () => {
  it("classifies shared CC2 layer roles", () => {
    expect(classifyTileLayer("FLOOR")).toBe("terrain");
    expect(classifyTileLayer("BLUE_KEY")).toBe("item");
    expect(classifyTileLayer("ANT")).toBe("mob");
    expect(classifyTileLayer("NOT_ALLOWED_MARKER")).toBe("noSign");
    expect(classifyTileLayer("THINWALL_CANOPY")).toBe("thinWalls");
  });

  it("exports a paintable tile catalog without modifier wrapper tiles", () => {
    expect(C2M_PAINTABLE_TILE_NAMES).toContain("BLUE_KEY");
    expect(C2M_PAINTABLE_TILE_NAMES).toContain("THINWALL_CANOPY");
    expect(C2M_PAINTABLE_TILE_NAMES).not.toContain("MODIFIER_8BIT");
  });

  it("round-trips a layered cell through flatten and rebuild", () => {
    const cell: TileSpecJson = {
      tile: "THINWALL_CANOPY",
      thinWallCanopy: { walls: ["N", "E"], canopy: true },
      lower: {
        tile: "NOT_ALLOWED_MARKER",
        lower: {
          tile: "ANT",
          dir: "W",
          lower: {
            tile: "BLUE_KEY",
            lower: "FLOOR",
          },
        },
      },
    };

    expect(buildCellFromLayers(flattenCellLayers(cell))).toEqual(cell);
  });

  it("uses terrain brushes to replace the whole cell", () => {
    const cell: TileSpecJson = {
      tile: "ANT",
      dir: "N",
      lower: {
        tile: "FIRE_BOOTS",
        lower: "FLOOR",
      },
    };

    expect(replaceCellForBrush(cell, "WATER")).toEqual("WATER");
    expect(getBrushRole("WATER")).toBe("terrain");
  });

  it("uses item brushes to replace only the item layer", () => {
    const cell: TileSpecJson = {
      tile: "ANT",
      dir: "N",
      lower: {
        tile: "FIRE_BOOTS",
        lower: "FLOOR",
      },
    };

    expect(replaceCellForBrush(cell, "BLUE_KEY")).toEqual({
      tile: "ANT",
      dir: "N",
      lower: {
        tile: "BLUE_KEY",
        lower: "FLOOR",
      },
    });
    expect(getBrushRole("BLUE_KEY")).toBe("item");
  });

  it("uses mob brushes to replace only the mob layer", () => {
    const cell: TileSpecJson = {
      tile: "ANT",
      dir: "N",
      lower: {
        tile: "FIRE_BOOTS",
        lower: "FLOOR",
      },
    };

    expect(
      replaceCellForBrush(cell, {
        tile: "GHOST",
        dir: "S",
      }),
    ).toEqual({
      tile: "GHOST",
      dir: "S",
      lower: {
        tile: "FIRE_BOOTS",
        lower: "FLOOR",
      },
    });
  });
});
