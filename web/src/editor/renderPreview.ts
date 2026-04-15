import { classifyTileLayer, canonicalizeTileSpec } from "../../../src/c2m/cellStack.js";
import type { TileSpecJson } from "../../../src/c2m/mapCodec.js";
import { CC2RendererCore } from "../../../src/c2m/render/cc2RendererCore.js";
import type { CC2Tileset } from "../../../src/c2m/render/cc2Tileset.js";
import type { RgbaImage } from "../../../src/c2m/render/rgbaImage.js";

const PREVIEW_FLOOR_TILE = "FLOOR";

function withPreviewLower(spec: TileSpecJson): TileSpecJson {
  if (typeof spec === "string") {
    return {
      tile: spec,
      lower: PREVIEW_FLOOR_TILE,
    };
  }

  return spec.lower === undefined
    ? {
        ...spec,
        lower: PREVIEW_FLOOR_TILE,
      }
    : spec;
}

export function createDefaultBrushTileSpec(tile: string | TileSpecJson): TileSpecJson {
  if (typeof tile !== "string") return canonicalizeTileSpec(tile);

  if (tile === "CUSTOM_FLOOR" || tile === "CUSTOM_WALL") {
    return {
      tile,
      modifiers: [{ kind: "CUSTOM_STYLE", style: "GREEN" }],
    };
  }

  if (tile === "LETTER_TILE") {
    return {
      tile,
      modifiers: [{ kind: "LETTER_SYMBOL", symbol: "A" }],
    };
  }

  if (tile === "CLONE_MACHINE" || tile === "CLONE_MACHINE_OLD") {
    return {
      tile,
      modifiers: [{ kind: "CLONE_ARROWS", arrows: ["N", "E", "S", "W"] }],
    };
  }

  if (tile === "RAILROAD_TRACK") {
    return {
      tile,
      modifiers: [
        {
          kind: "TRACKS",
          pieces: ["VERTICAL"],
          active: "V",
          entered: "N",
        },
      ],
    };
  }

  if (tile === "LOGIC_GATE") {
    return {
      tile,
      modifiers: [{ kind: "LOGIC", gate: "AND", facing: "E" }],
    };
  }

  if (tile === "THINWALL_CANOPY") {
    return {
      tile,
      thinWallCanopy: {
        walls: ["N", "E", "S", "W"],
        canopy: false,
      },
      lower: PREVIEW_FLOOR_TILE,
    };
  }

  if (tile === "DIRECTIONAL_BLOCK") {
    return {
      tile,
      dir: "N",
      directionalArrows: {
        arrows: ["N", "E", "S", "W"],
      },
      lower: PREVIEW_FLOOR_TILE,
    };
  }

  const role = classifyTileLayer(tile);
  if (role === "mob") {
    return {
      tile,
      dir: "N",
      lower: PREVIEW_FLOOR_TILE,
    };
  }

  if (role === "item" || role === "noSign" || role === "thinWalls") {
    return {
      tile,
      lower: PREVIEW_FLOOR_TILE,
    };
  }

  return tile;
}

export function createPreviewTileSpec(tile: string | TileSpecJson): TileSpecJson {
  const defaultSpec = createDefaultBrushTileSpec(tile);
  const tileName = typeof defaultSpec === "string" ? defaultSpec : defaultSpec.tile;
  return classifyTileLayer(tileName) === "terrain"
    ? canonicalizeTileSpec(defaultSpec)
    : canonicalizeTileSpec(withPreviewLower(defaultSpec));
}

export function renderTilePreview(tileset: CC2Tileset, tile: string | TileSpecJson): RgbaImage {
  const renderer = new CC2RendererCore(tileset);
  return renderer.renderMap({
    width: 1,
    height: 1,
    tiles: [createPreviewTileSpec(tile)],
  });
}
