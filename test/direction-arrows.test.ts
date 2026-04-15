import { describe, expect, it } from "vitest";

import { resolveMobDirectionArrow } from "../web/src/directionArrows.js";

describe("direction arrows", () => {
  it("resolves direction arrows from mob brushes", () => {
    expect(resolveMobDirectionArrow({ tile: "ANT", dir: "E", lower: "FLOOR" })).toBe("E");
  });

  it("resolves direction arrows from stacked cells with overlays above the mob", () => {
    expect(
      resolveMobDirectionArrow({
        tile: "NOT_ALLOWED_MARKER",
        lower: {
          tile: "ANT",
          dir: "W",
          lower: "FLOOR",
        },
      }),
    ).toBe("W");
  });

  it("ignores non-mob tiles", () => {
    expect(resolveMobDirectionArrow("FLOOR")).toBeNull();
    expect(
      resolveMobDirectionArrow({
        tile: "RAILROAD_TRACK",
      }),
    ).toBeNull();
  });
});
