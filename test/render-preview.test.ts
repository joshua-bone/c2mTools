import { describe, expect, it } from "vitest";

import { encodeMapJsonToBytes } from "../src/c2m/mapCodec.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { createDefaultBrushTileSpec } from "../web/src/editor/renderPreview.js";

describe("preview/default brush specs", () => {
  it("creates encodable defaults for direction- and overlay-heavy palette tiles", () => {
    const map = createEmptyC2mDoc({ width: 10, height: 10 }).map!;
    const tiles = [...map.tiles];

    tiles[0] = createDefaultBrushTileSpec("ANT");
    tiles[1] = createDefaultBrushTileSpec("DIRECTIONAL_BLOCK");
    tiles[2] = createDefaultBrushTileSpec("THINWALL_CANOPY");
    tiles[3] = createDefaultBrushTileSpec("RAILROAD_TRACK");
    tiles[4] = createDefaultBrushTileSpec("LOGIC_GATE");

    expect(() =>
      encodeMapJsonToBytes({
        width: map.width,
        height: map.height,
        tiles,
      }),
    ).not.toThrow();
  });
});
