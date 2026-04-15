import { KNOWN_CC2_TILE_NAMES } from "./mapCodec.js";
import type { ModifierJson, TileSpecJson, TileSpecObjJson } from "./mapCodec.js";

export type C2mCellLayerName = "terrain" | "item" | "mob" | "noSign" | "thinWalls";

export type C2mCellLayers = Readonly<{
  terrain: TileSpecObjJson;
  item?: TileSpecObjJson;
  mob?: TileSpecObjJson;
  noSign?: TileSpecObjJson;
  thinWalls?: TileSpecObjJson;
}>;

type MutableC2mCellLayers = {
  terrain?: TileSpecObjJson;
  item?: TileSpecObjJson;
  mob?: TileSpecObjJson;
  noSign?: TileSpecObjJson;
  thinWalls?: TileSpecObjJson;
};

export const C2M_THIN_WALL_TILE_NAMES: ReadonlyArray<string> = Object.freeze(["THINWALL_CANOPY"]);

export const C2M_NO_SIGN_TILE_NAMES: ReadonlyArray<string> = Object.freeze(["NOT_ALLOWED_MARKER"]);

export const C2M_MOB_TILE_NAMES: ReadonlyArray<string> = Object.freeze([
  "CHIP",
  "MELINDA",
  "DIRT_BLOCK",
  "WALKER",
  "SHIP",
  "ICE_BLOCK",
  "BLUE_TANK",
  "ANT",
  "CENTIPEDE",
  "PURPLE_BALL",
  "BLOB",
  "ANGRY_TEETH",
  "TIMID_TEETH",
  "FIRE_BOX",
  "YELLOW_TANK",
  "MIRROR_CHIP",
  "MIRROR_MELINDA",
  "ROVER",
  "DIRECTIONAL_BLOCK",
  "FLOOR_MIMIC",
  "GHOST",
]);

export const C2M_ITEM_TILE_NAMES: ReadonlyArray<string> = Object.freeze([
  "RED_KEY",
  "BLUE_KEY",
  "YELLOW_KEY",
  "GREEN_KEY",
  "IC_CHIP",
  "EXTRA_IC_CHIP",
  "CLEATS",
  "SUCTION_BOOTS",
  "FIRE_BOOTS",
  "FLIPPERS",
  "CHERRY_BOMB",
  "TIME_BONUS",
  "STOPWATCH",
  "TIME_BOMB",
  "HELMET",
  "HIKING_BOOTS",
  "LIGHTNING_BOLT",
  "BOWLING_BALL",
  "TIME_PENALTY",
  "RAILROAD_SIGN",
  "FLAG_10",
  "FLAG_100",
  "FLAG_1000",
  "FLAG_2X",
  "GREEN_BOMB",
  "GREEN_CHIP",
  "STEEL_FOIL",
  "SECRET_EYE",
  "THIEF_BRIBE",
  "SPEED_BOOTS",
  "HOOK",
]);

const THIN_WALL_TILE_NAME_SET = new Set(C2M_THIN_WALL_TILE_NAMES);
const NO_SIGN_TILE_NAME_SET = new Set(C2M_NO_SIGN_TILE_NAMES);
const MOB_TILE_NAME_SET = new Set(C2M_MOB_TILE_NAMES);
const ITEM_TILE_NAME_SET = new Set(C2M_ITEM_TILE_NAMES);

export const C2M_PAINTABLE_TILE_NAMES: ReadonlyArray<string> = Object.freeze(
  KNOWN_CC2_TILE_NAMES.filter(
    (name) =>
      name !== "UNUSED_53" &&
      name !== "UNUSED_54" &&
      name !== "UNUSED_55" &&
      name !== "UNUSED_5D" &&
      name !== "UNUSED_67" &&
      name !== "UNUSED_6C" &&
      name !== "UNUSED_6E" &&
      name !== "UNUSED_74" &&
      name !== "UNUSED_75" &&
      name !== "UNUSED_79" &&
      name !== "UNUSED_85" &&
      name !== "UNUSED_86" &&
      name !== "UNUSED_91",
  ),
);

const TOP_TO_BOTTOM_LAYER_ORDER: ReadonlyArray<C2mCellLayerName> = Object.freeze([
  "thinWalls",
  "noSign",
  "mob",
  "item",
  "terrain",
]);

const BOTTOM_TO_TOP_LAYER_ORDER: ReadonlyArray<Exclude<C2mCellLayerName, "terrain">> =
  Object.freeze(["item", "mob", "noSign", "thinWalls"]);

function cloneModifier(modifier: ModifierJson): ModifierJson {
  switch (modifier.kind) {
    case "WIRES":
      return {
        kind: "WIRES",
        wires: [...modifier.wires],
        tunnels: [...modifier.tunnels],
      };
    case "TRACKS":
      return {
        kind: "TRACKS",
        pieces: [...modifier.pieces],
        active: modifier.active,
        entered: modifier.entered,
      };
    case "CLONE_ARROWS":
      return {
        kind: "CLONE_ARROWS",
        arrows: [...modifier.arrows],
      };
    case "CUSTOM_STYLE":
      return {
        kind: "CUSTOM_STYLE",
        style: modifier.style,
      };
    case "LETTER_SYMBOL":
      return {
        kind: "LETTER_SYMBOL",
        symbol: modifier.symbol,
      };
    case "LOGIC":
      return {
        kind: "LOGIC",
        gate: modifier.gate,
        ...(modifier.facing !== undefined ? { facing: modifier.facing } : {}),
        ...(modifier.counterValue !== undefined ? { counterValue: modifier.counterValue } : {}),
      };
  }
}

export function cloneTileSpec(spec: TileSpecJson): TileSpecJson {
  if (typeof spec === "string") return spec;

  return {
    tile: spec.tile,
    ...(spec.dir !== undefined ? { dir: spec.dir } : {}),
    ...(spec.thinWallCanopy
      ? {
          thinWallCanopy: {
            walls: [...spec.thinWallCanopy.walls],
            canopy: spec.thinWallCanopy.canopy,
          },
        }
      : {}),
    ...(spec.directionalArrows
      ? {
          directionalArrows: {
            arrows: [...spec.directionalArrows.arrows],
          },
        }
      : {}),
    ...(spec.modifiers
      ? {
          modifiers: spec.modifiers.map((modifier) => cloneModifier(modifier)),
        }
      : {}),
    ...(spec.lower !== undefined ? { lower: cloneTileSpec(spec.lower) } : {}),
  };
}

export function toTileSpecObj(spec: TileSpecJson): TileSpecObjJson {
  return typeof spec === "string" ? { tile: spec } : spec;
}

export function classifyTileLayer(tileName: string): C2mCellLayerName {
  if (THIN_WALL_TILE_NAME_SET.has(tileName)) return "thinWalls";
  if (NO_SIGN_TILE_NAME_SET.has(tileName)) return "noSign";
  if (MOB_TILE_NAME_SET.has(tileName)) return "mob";
  if (ITEM_TILE_NAME_SET.has(tileName)) return "item";
  return "terrain";
}

export function isTerrainTileName(tileName: string): boolean {
  return classifyTileLayer(tileName) === "terrain";
}

function cloneTileSpecObjWithoutLower(spec: TileSpecObjJson): TileSpecObjJson {
  const cloned = cloneTileSpec(spec);
  if (typeof cloned === "string") return { tile: cloned };

  const { lower: _lower, ...rest } = cloned;
  return rest;
}

function isPlainTileObject(spec: TileSpecObjJson): boolean {
  return (
    spec.dir === undefined &&
    spec.thinWallCanopy === undefined &&
    spec.directionalArrows === undefined &&
    spec.modifiers === undefined &&
    spec.lower === undefined
  );
}

export function canonicalizeTileSpec(spec: TileSpecJson): TileSpecJson {
  if (typeof spec === "string") return spec;

  const out = {
    tile: spec.tile,
    ...(spec.dir !== undefined ? { dir: spec.dir } : {}),
    ...(spec.thinWallCanopy !== undefined
      ? {
          thinWallCanopy: {
            walls: [...spec.thinWallCanopy.walls],
            canopy: spec.thinWallCanopy.canopy,
          },
        }
      : {}),
    ...(spec.directionalArrows !== undefined
      ? {
          directionalArrows: {
            arrows: [...spec.directionalArrows.arrows],
          },
        }
      : {}),
    ...(spec.modifiers !== undefined
      ? {
          modifiers: spec.modifiers.map((modifier) => cloneModifier(modifier)),
        }
      : {}),
    ...(spec.lower !== undefined ? { lower: canonicalizeTileSpec(spec.lower) } : {}),
  };

  return isPlainTileObject(out) ? out.tile : out;
}

export function flattenCellLayers(spec: TileSpecJson): C2mCellLayers {
  let current: TileSpecJson | undefined = spec;
  const layers: MutableC2mCellLayers = {};

  while (current !== undefined) {
    const tile = toTileSpecObj(current);
    const role = classifyTileLayer(tile.tile);

    if (role === "terrain") {
      layers.terrain = cloneTileSpec(tile) as TileSpecObjJson;
      break;
    }

    layers[role] = cloneTileSpecObjWithoutLower(tile);
    current = tile.lower;
  }

  if (!layers.terrain) {
    layers.terrain = toTileSpecObj(cloneTileSpec(spec));
  }

  return layers as C2mCellLayers;
}

export function buildCellFromLayers(layers: C2mCellLayers): TileSpecJson {
  let current: TileSpecJson = cloneTileSpec(layers.terrain);

  for (const role of BOTTOM_TO_TOP_LAYER_ORDER) {
    const layer = layers[role];
    if (!layer) continue;

    current = {
      ...cloneTileSpecObjWithoutLower(layer),
      lower: canonicalizeTileSpec(current),
    };
  }

  return canonicalizeTileSpec(current);
}

export function resolveBrushRole(layers: C2mCellLayers): C2mCellLayerName {
  for (const role of TOP_TO_BOTTOM_LAYER_ORDER) {
    if (role === "terrain") return "terrain";
    if (layers[role] !== undefined) return role;
  }
  return "terrain";
}

export function getBrushRole(brush: TileSpecJson): C2mCellLayerName {
  return resolveBrushRole(flattenCellLayers(brush));
}

export function replaceCellForBrush(cell: TileSpecJson, brush: TileSpecJson): TileSpecJson {
  const brushLayers = flattenCellLayers(brush);
  const brushRole = resolveBrushRole(brushLayers);

  if (brushRole === "terrain") {
    return canonicalizeTileSpec(cloneTileSpec(brushLayers.terrain));
  }

  const currentLayers = flattenCellLayers(cell);
  const nextLayer = brushLayers[brushRole];
  if (!nextLayer) return buildCellFromLayers(currentLayers);

  return buildCellFromLayers({
    ...currentLayers,
    [brushRole]: cloneTileSpecObjWithoutLower(nextLayer),
  });
}
