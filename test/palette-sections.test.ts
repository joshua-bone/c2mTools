import { describe, expect, it } from "vitest";

import { getPaletteSections } from "../web/src/paletteSections.js";

describe("palette sections", () => {
  it("groups the shared CC2 tile catalog into terrain, items, mobs, and overlays", () => {
    const sections = getPaletteSections({ query: "" });

    expect(sections.map((section) => section.key)).toEqual([
      "terrain",
      "item",
      "mob",
      "overlay",
      "tool",
    ]);
    expect(
      sections.find((section) => section.key === "terrain")?.tiles.map((tile) => tile.key),
    ).toContain("WATER");
    expect(
      sections.find((section) => section.key === "item")?.tiles.map((tile) => tile.key),
    ).toContain("FIRE_BOOTS");
    expect(
      sections.find((section) => section.key === "mob")?.tiles.map((tile) => tile.key),
    ).toContain("ANT");
    expect(
      sections.find((section) => section.key === "overlay")?.tiles.map((tile) => tile.key),
    ).toContain("THINWALL_CANOPY");
    expect(
      sections.find((section) => section.key === "overlay")?.tiles.map((tile) => tile.key),
    ).toContain("NOT_ALLOWED_MARKER");
    expect(
      sections.find((section) => section.key === "tool")?.tiles.map((tile) => tile.key),
    ).toEqual(["WIRE_TOOL"]);
  });

  it("filters by both raw tile names and formatted display names", () => {
    expect(getPaletteSections({ query: "fire boots" })).toEqual([
      {
        key: "item",
        title: "Items",
        tiles: [
          expect.objectContaining({
            key: "FIRE_BOOTS",
          }),
        ],
      },
    ]);

    expect(getPaletteSections({ query: "not allowed" })).toEqual([
      {
        key: "overlay",
        title: "Overlays",
        tiles: [
          expect.objectContaining({
            key: "NOT_ALLOWED_MARKER",
          }),
        ],
      },
    ]);
  });

  it("keeps related items adjacent in the palette order", () => {
    const itemKeys =
      getPaletteSections({ query: "" })
        .find((section) => section.key === "item")
        ?.tiles.map((tile) => tile.key) ?? [];

    expect(itemKeys.indexOf("RED_KEY")).toBeLessThan(itemKeys.indexOf("GREEN_KEY"));
    expect(itemKeys.indexOf("FLIPPERS")).toBeLessThan(itemKeys.indexOf("SPEED_BOOTS"));
    expect(itemKeys.indexOf("IC_CHIP")).toBeLessThan(itemKeys.indexOf("GREEN_BOMB"));
    expect(itemKeys.indexOf("TIME_BONUS")).toBeLessThan(itemKeys.indexOf("TIME_BOMB"));
  });

  it("keeps toggle floors and walls together ahead of the swivel door", () => {
    const terrainKeys =
      getPaletteSections({ query: "" })
        .find((section) => section.key === "terrain")
        ?.tiles.map((tile) => tile.key) ?? [];

    expect(terrainKeys.indexOf("GREEN_TOGGLE_WALL")).toBe(
      terrainKeys.indexOf("GREEN_TOGGLE_FLOOR") + 1,
    );
    expect(terrainKeys.indexOf("PURPLE_TOGGLE_WALL")).toBe(
      terrainKeys.indexOf("PURPLE_TOGGLE_FLOOR") + 1,
    );
    expect(terrainKeys.indexOf("SWIVEL_DOOR")).toBeGreaterThan(
      terrainKeys.indexOf("PURPLE_TOGGLE_WALL"),
    );
  });

  it("includes C2M-specific palette variants and excludes obsolete tiles", () => {
    const sections = getPaletteSections({ query: "" });
    const allKeys = sections.flatMap((section) => section.tiles.map((tile) => tile.key));

    expect(allKeys).toContain("RAILROAD_TRACK:line");
    expect(allKeys).toContain("RAILROAD_TRACK:corner");
    expect(allKeys).toContain("RAILROAD_TRACK:switch");
    expect(allKeys).toContain("WIRE_TOOL");
    expect(allKeys).toContain("LOGIC_GATE:COUNTER");
    expect(allKeys).toContain("ICE_CORNER");
    expect(allKeys).toContain("FORCE_FLOOR");
    expect(allKeys).toContain("SWIVEL_DOOR");
    expect(allKeys).toContain("DIRECTIONAL_BLOCK:4");
    expect(allKeys).not.toContain("CLONE_MACHINE_OLD");
    expect(allKeys).not.toContain("EXPLOSION_ANIMATION_UNUSED");
    expect(allKeys).not.toContain("THIN_WALL_S");
    expect(allKeys).not.toContain("THIN_WALL_E");
    expect(allKeys).not.toContain("THIN_WALL_SE");
  });

  it("resolves direction-driven palette variants from the shared global direction state", () => {
    const sections = getPaletteSections({
      query: "",
      globalDirection: "E",
      logicCounterValue: 7,
    });
    const allEntries = sections.flatMap((section) => section.tiles);

    expect(allEntries.find((entry) => entry.key === "FORCE_FLOOR")).toEqual(
      expect.objectContaining({
        kind: "brush",
        tile: "FORCE_E",
      }),
    );
    expect(allEntries.find((entry) => entry.key === "ICE_CORNER")).toEqual(
      expect.objectContaining({
        kind: "brush",
        tile: "ICE_CORNER_SE",
      }),
    );
    expect(allEntries.find((entry) => entry.key === "SWIVEL_DOOR")).toEqual(
      expect.objectContaining({
        kind: "brush",
        tile: "SWIVEL_DOOR_SE",
      }),
    );
    expect(allEntries.find((entry) => entry.key === "THINWALL_CANOPY")).toEqual(
      expect.objectContaining({
        kind: "brush",
        tile: {
          tile: "THINWALL_CANOPY",
          thinWallCanopy: { walls: ["E"], canopy: false },
          lower: "FLOOR",
        },
      }),
    );
    expect(allEntries.find((entry) => entry.key === "LOGIC_GATE:COUNTER")).toEqual(
      expect.objectContaining({
        kind: "brush",
        tile: {
          tile: "LOGIC_GATE",
          modifiers: [{ kind: "LOGIC", gate: "COUNTER", counterValue: 7 }],
        },
      }),
    );
  });
});
