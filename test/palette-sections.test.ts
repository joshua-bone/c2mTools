import { describe, expect, it } from "vitest";

import { getPaletteSections } from "../web/src/paletteSections.js";

describe("palette sections", () => {
  it("groups the shared CC2 tile catalog into terrain, items, mobs, and overlays", () => {
    const sections = getPaletteSections({ query: "" });

    expect(sections.map((section) => section.key)).toEqual(["terrain", "item", "mob", "overlay"]);
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

  it("includes C2M-specific palette variants and excludes obsolete tiles", () => {
    const sections = getPaletteSections({ query: "" });
    const allKeys = sections.flatMap((section) => section.tiles.map((tile) => tile.key));

    expect(allKeys).toContain("RAILROAD_TRACK:vertical");
    expect(allKeys).toContain("RAILROAD_TRACK:corner");
    expect(allKeys).toContain("RAILROAD_TRACK:switch");
    expect(allKeys).toContain("DIRECTIONAL_BLOCK:4");
    expect(allKeys).not.toContain("CLONE_MACHINE_OLD");
    expect(allKeys).not.toContain("EXPLOSION_ANIMATION_UNUSED");
    expect(allKeys).not.toContain("THIN_WALL_S");
    expect(allKeys).not.toContain("THIN_WALL_E");
    expect(allKeys).not.toContain("THIN_WALL_SE");
  });
});
