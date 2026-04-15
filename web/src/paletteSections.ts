import { C2M_PAINTABLE_TILE_NAMES, classifyTileLayer } from "../../src/c2m/cellStack.js";
import type { TileSpecJson } from "../../src/c2m/mapCodec.js";
import { describeTileSpec, formatTileDisplayName, getTileSpecName } from "./editor/tileDisplay.js";
import { createDefaultBrushTileSpec } from "./editor/renderPreview.js";

export type PaletteTileEntry = Readonly<{
  key: string;
  tile: TileSpecJson;
  label: string;
  searchText: string;
  order: number;
}>;

export type PaletteTileSection = Readonly<{
  key: string;
  title: string;
  tiles: ReadonlyArray<PaletteTileEntry>;
}>;

type PaletteSectionsOptions = Readonly<{
  query: string;
}>;

const SECTION_ORDER = ["terrain", "item", "mob", "overlay"] as const;

const SECTION_TITLES: Record<(typeof SECTION_ORDER)[number], string> = {
  terrain: "Terrain",
  item: "Items",
  mob: "Creatures",
  overlay: "Overlays",
};

const EXCLUDED_TILE_NAMES = new Set([
  "CLONE_MACHINE_OLD",
  "EXPLOSION_ANIMATION_UNUSED",
  "THIN_WALL_S",
  "THIN_WALL_E",
  "THIN_WALL_SE",
]);

const TERRAIN_GROUPS: ReadonlyArray<ReadonlyArray<string>> = Object.freeze([
  [
    "WALL",
    "STEEL_WALL",
    "SOLID_BLUE_WALL",
    "FALSE_BLUE_WALL",
    "SOLID_GREEN_WALL",
    "FALSE_GREEN_WALL",
  ],
  ["RED_DOOR", "BLUE_DOOR", "YELLOW_DOOR", "GREEN_DOOR", "CHIP_SOCKET", "EXIT"],
  [
    "GREEN_BUTTON",
    "BLUE_BUTTON",
    "RED_BUTTON",
    "BROWN_BUTTON",
    "GRAY_BUTTON",
    "ORANGE_BUTTON",
    "BLACK_BUTTON",
    "PINK_BUTTON",
    "SWITCH_OFF",
    "SWITCH_ON",
    "YELLOW_TANK_BUTTON",
  ],
  ["ICE", "ICE_CORNER_NE", "ICE_CORNER_NW", "ICE_CORNER_SE", "ICE_CORNER_SW"],
  ["FORCE_N", "FORCE_E", "FORCE_S", "FORCE_W", "FORCE_RANDOM"],
  ["WATER", "FIRE", "SLIME"],
  ["DIRT", "GRAVEL", "POP_UP_WALL", "APPEARING_WALL", "INVISIBLE_WALL"],
  [
    "TOOL_THIEF",
    "KEY_THIEF",
    "TRANSMOGRIFIER",
    "YELLOW_TELEPORT",
    "GREEN_TELEPORT",
    "BLUE_TELEPORT",
    "RED_TELEPORT",
  ],
  ["TRAP", "OPEN_TRAP_UNUSED", "CLONE_MACHINE", "RAILROAD_TRACK", "LOGIC_GATE", "RAILROAD_SIGN"],
  [
    "GREEN_TOGGLE_FLOOR",
    "GREEN_TOGGLE_WALL",
    "PURPLE_TOGGLE_FLOOR",
    "PURPLE_TOGGLE_WALL",
    "CUSTOM_FLOOR",
    "CUSTOM_WALL",
    "LETTER_TILE",
    "TURTLE",
    "SWIVEL_DOOR_SW",
    "SWIVEL_DOOR_NW",
    "SWIVEL_DOOR_NE",
    "SWIVEL_DOOR_SE",
    "MALE_ONLY_SIGN",
    "FEMALE_ONLY_SIGN",
    "CLUE",
    "FLAME_JET_OFF",
    "FLAME_JET_ON",
  ],
]);

const TERRAIN_GROUP_ORDER = new Map(
  TERRAIN_GROUPS.flatMap((group, groupIndex) =>
    group.map((tileName, itemIndex) => [tileName, groupIndex * 100 + itemIndex] as const),
  ),
);

function makeRailroadEntry(
  key: string,
  label: string,
  pieces: ReadonlyArray<
    "TURN_NE" | "TURN_SE" | "TURN_SW" | "TURN_NW" | "HORIZONTAL" | "VERTICAL" | "SWITCH"
  >,
  active: "NE" | "SE" | "SW" | "NW" | "H" | "V",
  order: number,
): PaletteTileEntry {
  const tile: TileSpecJson = {
    tile: "RAILROAD_TRACK",
    modifiers: [
      {
        kind: "TRACKS",
        pieces: [...pieces],
        active,
        entered: "N",
      },
    ],
  };

  return {
    key,
    tile,
    label,
    searchText: `${label} railroad railroad track ${pieces.join(" ")}`,
    order,
  };
}

function makeDirectionalBlockEntry(
  key: string,
  label: string,
  arrows: ReadonlyArray<"N" | "E" | "S" | "W">,
  order: number,
): PaletteTileEntry {
  const tile: TileSpecJson = {
    tile: "DIRECTIONAL_BLOCK",
    dir: "N",
    directionalArrows: {
      arrows: [...arrows],
    },
    lower: "FLOOR",
  };

  return {
    key,
    tile,
    label,
    searchText: `${label} directional block ${arrows.join(" ")}`,
    order,
  };
}

const PALETTE_VARIANTS = new Map<string, ReadonlyArray<PaletteTileEntry>>([
  [
    "RAILROAD_TRACK",
    Object.freeze([
      makeRailroadEntry("RAILROAD_TRACK:vertical", "Railroad Track (N/S)", ["VERTICAL"], "V", 8000),
      makeRailroadEntry(
        "RAILROAD_TRACK:corner",
        "Railroad Track (Corner)",
        ["TURN_NE"],
        "NE",
        8001,
      ),
      makeRailroadEntry(
        "RAILROAD_TRACK:switch",
        "Railroad Track (Switch)",
        ["VERTICAL", "TURN_NE", "SWITCH"],
        "V",
        8002,
      ),
    ]),
  ],
  [
    "DIRECTIONAL_BLOCK",
    Object.freeze([
      makeDirectionalBlockEntry(
        "DIRECTIONAL_BLOCK:0",
        "Directional Block (0 Directions)",
        [],
        9000,
      ),
      makeDirectionalBlockEntry(
        "DIRECTIONAL_BLOCK:1",
        "Directional Block (1 Direction)",
        ["N"],
        9001,
      ),
      makeDirectionalBlockEntry(
        "DIRECTIONAL_BLOCK:2-adj",
        "Directional Block (2 Adjacent)",
        ["N", "E"],
        9002,
      ),
      makeDirectionalBlockEntry(
        "DIRECTIONAL_BLOCK:2-opp",
        "Directional Block (2 Opposite)",
        ["N", "S"],
        9003,
      ),
      makeDirectionalBlockEntry(
        "DIRECTIONAL_BLOCK:3",
        "Directional Block (3 Directions)",
        ["N", "E", "S"],
        9004,
      ),
      makeDirectionalBlockEntry(
        "DIRECTIONAL_BLOCK:4",
        "Directional Block (4 Directions)",
        ["N", "E", "S", "W"],
        9005,
      ),
    ]),
  ],
]);

function terrainSortOrder(tileName: string): number {
  return TERRAIN_GROUP_ORDER.get(tileName) ?? 10000;
}

function makeBaseEntry(tileName: string): PaletteTileEntry {
  const tile = createDefaultBrushTileSpec(tileName);
  const label = describeTileSpec(tile) ?? formatTileDisplayName(tileName);
  const sectionKey = sectionKeyForTile(tileName);
  const order =
    sectionKey === "terrain"
      ? terrainSortOrder(tileName)
      : sectionKey === "item"
        ? 20000
        : sectionKey === "mob"
          ? 30000
          : 40000;

  return {
    key: tileName,
    tile,
    label,
    searchText: `${tileName} ${label} ${formatTileDisplayName(tileName)}`,
    order,
  };
}

function matchesQuery(entry: PaletteTileEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return true;
  return entry.searchText.toLowerCase().includes(normalizedQuery);
}

function sectionKeyForTile(tileName: string): (typeof SECTION_ORDER)[number] {
  const layer = classifyTileLayer(tileName);
  if (layer === "item") return "item";
  if (layer === "mob") return "mob";
  if (layer === "noSign" || layer === "thinWalls") return "overlay";
  return "terrain";
}

function buildPaletteEntries(): PaletteTileEntry[] {
  const entries: PaletteTileEntry[] = [];

  for (const tileName of C2M_PAINTABLE_TILE_NAMES) {
    if (EXCLUDED_TILE_NAMES.has(tileName)) continue;

    const variants = PALETTE_VARIANTS.get(tileName);
    if (variants) {
      entries.push(...variants);
      continue;
    }

    entries.push(makeBaseEntry(tileName));
  }

  return entries;
}

const ALL_PALETTE_ENTRIES = buildPaletteEntries();

export function getPaletteSections(options: PaletteSectionsOptions): PaletteTileSection[] {
  const bySection = new Map<(typeof SECTION_ORDER)[number], PaletteTileEntry[]>();

  for (const entry of ALL_PALETTE_ENTRIES) {
    if (!matchesQuery(entry, options.query)) continue;

    const sectionKey = sectionKeyForTile(getTileSpecName(entry.tile));
    const sectionTiles = bySection.get(sectionKey);
    if (sectionTiles) {
      sectionTiles.push(entry);
      continue;
    }

    bySection.set(sectionKey, [entry]);
  }

  return SECTION_ORDER.flatMap((sectionKey) => {
    const tiles = bySection.get(sectionKey);
    if (!tiles || tiles.length === 0) return [];

    return [
      {
        key: sectionKey,
        title: SECTION_TITLES[sectionKey],
        tiles: [...tiles].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
      },
    ];
  });
}
