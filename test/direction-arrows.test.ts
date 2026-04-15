import { describe, expect, it } from "vitest";

import {
  resolveMobDirectionArrow,
  resolvePaletteDirectionArrow,
} from "../web/src/directionArrows.js";

describe("direction arrows", () => {
  it("always resolves direction arrows for ball, walker, and fireball creatures", () => {
    expect(resolveMobDirectionArrow({ tile: "PURPLE_BALL", dir: "E", lower: "FLOOR" })).toBe("E");
    expect(resolveMobDirectionArrow({ tile: "WALKER", dir: "S", lower: "FLOOR" })).toBe("S");
    expect(resolveMobDirectionArrow({ tile: "FIRE_BOX", dir: "W", lower: "FLOOR" })).toBe("W");
  });

  it("restores palette arrows for ball, walker, fireball, and blob", () => {
    expect(resolvePaletteDirectionArrow({ tile: "PURPLE_BALL", dir: "E", lower: "FLOOR" })).toBe(
      "E",
    );
    expect(resolvePaletteDirectionArrow({ tile: "WALKER", dir: "S", lower: "FLOOR" })).toBe("S");
    expect(resolvePaletteDirectionArrow({ tile: "FIRE_BOX", dir: "W", lower: "FLOOR" })).toBe("W");
    expect(resolvePaletteDirectionArrow({ tile: "BLOB", dir: "N", lower: "FLOOR" })).toBe("N");
    expect(resolvePaletteDirectionArrow({ tile: "ANT", dir: "E", lower: "FLOOR" })).toBeNull();
  });

  it("shows direction arrows for block/teeth/blob/floor mimic only on cloners or traps", () => {
    expect(
      resolveMobDirectionArrow({
        tile: "NOT_ALLOWED_MARKER",
        lower: {
          tile: "FLOOR_MIMIC",
          dir: "W",
          lower: "TRAP",
        },
      }),
    ).toBe("W");

    expect(resolveMobDirectionArrow({ tile: "BLOB", dir: "N", lower: "FLOOR" })).toBeNull();
    expect(resolveMobDirectionArrow({ tile: "DIRT_BLOCK", dir: "E", lower: "CLONE_MACHINE" })).toBe(
      "E",
    );
  });

  it("ignores non-arrow mobs and non-mob tiles", () => {
    expect(resolveMobDirectionArrow({ tile: "ANT", dir: "E", lower: "FLOOR" })).toBeNull();
    expect(resolveMobDirectionArrow("FLOOR")).toBeNull();
    expect(
      resolveMobDirectionArrow({
        tile: "RAILROAD_TRACK",
      }),
    ).toBeNull();
  });
});
