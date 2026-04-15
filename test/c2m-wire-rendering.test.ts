import { describe, expect, it } from "vitest";

import { CC2RendererCore } from "../src/c2m/render/cc2RendererCore.js";
import { CC2Tileset } from "../src/c2m/render/cc2Tileset.js";
import { createImage, type RgbaImage } from "../src/c2m/render/rgbaImage.js";

const TILE_SIZE = 32;
const TILESET_COLUMNS = 16;
const TILESET_ROWS = 32;

function createFakeTilesetSheet(): RgbaImage {
  const sheet = createImage(TILESET_COLUMNS * TILE_SIZE, TILESET_ROWS * TILE_SIZE, [0, 0, 0, 0]);

  for (let tileY = 0; tileY < TILESET_ROWS; tileY += 1) {
    for (let tileX = 0; tileX < TILESET_COLUMNS; tileX += 1) {
      const color = [
        (tileX * 17 + tileY * 3) % 256,
        (tileX * 11 + tileY * 5) % 256,
        (tileX * 7 + tileY * 13) % 256,
        255,
      ] as const;

      for (let y = 0; y < TILE_SIZE; y += 1) {
        for (let x = 0; x < TILE_SIZE; x += 1) {
          const px = tileX * TILE_SIZE + x;
          const py = tileY * TILE_SIZE + y;
          const offset = (py * sheet.width + px) * 4;
          sheet.data[offset] = color[0];
          sheet.data[offset + 1] = color[1];
          sheet.data[offset + 2] = color[2];
          sheet.data[offset + 3] = color[3];
        }
      }
    }
  }

  return sheet;
}

describe("c2m wire rendering", () => {
  it("does not render empty wire nodes as persistent spool icons", () => {
    const renderer = new CC2RendererCore(new CC2Tileset(createFakeTilesetSheet()));

    const plain = renderer.renderMap({
      width: 1,
      height: 1,
      tiles: ["FLOOR"],
    });
    const emptyWireNode = renderer.renderMap({
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "FLOOR",
          modifiers: [{ kind: "WIRES", wires: [], tunnels: [] }],
        },
      ],
    });

    expect(Array.from(emptyWireNode.data)).toEqual(Array.from(plain.data));
  });
});
