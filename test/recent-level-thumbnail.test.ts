import { describe, expect, it } from "vitest";

import { resolveRecentLevelThumbnailTileSize } from "../web/src/recentLevelSizing.js";

describe("recent level thumbnail sizing", () => {
  it("uses full-size tiles when the map already fits", () => {
    expect(resolveRecentLevelThumbnailTileSize({ width: 6, height: 6 })).toBe(32);
  });

  it("snaps to 16px tiles when that is the largest size that fits", () => {
    expect(resolveRecentLevelThumbnailTileSize({ width: 12, height: 10 })).toBe(16);
  });

  it("snaps to 8px tiles for medium maps", () => {
    expect(resolveRecentLevelThumbnailTileSize({ width: 20, height: 12 })).toBe(8);
  });

  it("snaps to 4px tiles for larger maps", () => {
    expect(resolveRecentLevelThumbnailTileSize({ width: 40, height: 32 })).toBe(4);
  });

  it("snaps to 2px tiles for very large maps", () => {
    expect(resolveRecentLevelThumbnailTileSize({ width: 100, height: 100 })).toBe(2);
  });

  it("falls back to 1px tiles if nothing larger can fit", () => {
    expect(resolveRecentLevelThumbnailTileSize({ width: 300, height: 200 })).toBe(1);
  });
});
