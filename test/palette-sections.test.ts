import { describe, expect, it } from "vitest";

import { getPaletteSections } from "../web/src/paletteSections.js";

describe("palette sections", () => {
  it("groups the shared CC2 tile catalog into terrain, items, mobs, and overlays", () => {
    const sections = getPaletteSections({ query: "" });

    expect(sections.map((section) => section.key)).toEqual(["terrain", "item", "mob", "overlay"]);
    expect(sections.find((section) => section.key === "terrain")?.tiles).toContain("WATER");
    expect(sections.find((section) => section.key === "item")?.tiles).toContain("FIRE_BOOTS");
    expect(sections.find((section) => section.key === "mob")?.tiles).toContain("ANT");
    expect(sections.find((section) => section.key === "overlay")?.tiles).toContain(
      "THINWALL_CANOPY",
    );
    expect(sections.find((section) => section.key === "overlay")?.tiles).toContain(
      "NOT_ALLOWED_MARKER",
    );
  });

  it("filters by both raw tile names and formatted display names", () => {
    expect(getPaletteSections({ query: "fire boots" })).toEqual([
      {
        key: "item",
        title: "Items",
        tiles: ["FIRE_BOOTS"],
      },
    ]);

    expect(getPaletteSections({ query: "not allowed" })).toEqual([
      {
        key: "overlay",
        title: "Overlays",
        tiles: ["NOT_ALLOWED_MARKER"],
      },
    ]);
  });
});
