import { C2M_PAINTABLE_TILE_NAMES, classifyTileLayer } from "../../src/c2m/cellStack.js";
import type { Dir, LogicGate, ModifierJson, TileSpecJson } from "../../src/c2m/mapCodec.js";
import { DIR_ORDER, rotateBrushSpec } from "./editor/brushTransforms.js";
import { resolveRequiredWireDirections } from "./editor/cellInspector.js";
import { createDefaultBrushTileSpec } from "./editor/renderPreview.js";
import { describeTileSpec, formatTileDisplayName } from "./editor/tileDisplay.js";

type PaletteSectionKey = "terrain" | "item" | "mob" | "overlay" | "tool";

export type PaletteBrushEntry = Readonly<{
  kind: "brush";
  key: string;
  sectionKey: PaletteSectionKey;
  tile: TileSpecJson;
  label: string;
  searchText: string;
  order: number;
  allowSecondaryAssign: boolean;
}>;

export type PaletteToolEntry = Readonly<{
  kind: "tool";
  key: string;
  sectionKey: PaletteSectionKey;
  tool: "wire";
  previewSpriteCell: Readonly<{ x: number; y: number }>;
  label: string;
  searchText: string;
  order: number;
  allowSecondaryAssign: false;
}>;

export type PaletteTileEntry = PaletteBrushEntry | PaletteToolEntry;

export type PaletteTileSection = Readonly<{
  key: PaletteSectionKey;
  title: string;
  tiles: ReadonlyArray<PaletteTileEntry>;
}>;

type PaletteSectionsOptions = Readonly<{
  query: string;
  globalDirection?: Dir;
  logicCounterValue?: number;
}>;

const SECTION_ORDER: ReadonlyArray<PaletteSectionKey> = Object.freeze([
  "terrain",
  "item",
  "mob",
  "overlay",
  "tool",
]);

const SECTION_TITLES: Record<PaletteSectionKey, string> = {
  terrain: "Terrain",
  item: "Items",
  mob: "Creatures",
  overlay: "Overlays",
  tool: "Tools",
};

const EXCLUDED_TILE_NAMES = new Set([
  "CLONE_MACHINE_OLD",
  "EXPLOSION_ANIMATION_UNUSED",
  "THIN_WALL_S",
  "THIN_WALL_E",
  "THIN_WALL_SE",
]);

const TEMPLATE_REPLACED_TILE_NAMES = new Set([
  "RAILROAD_TRACK",
  "DIRECTIONAL_BLOCK",
  "LOGIC_GATE",
  "THINWALL_CANOPY",
  "FORCE_N",
  "FORCE_E",
  "FORCE_S",
  "FORCE_W",
  "ICE_CORNER_NE",
  "ICE_CORNER_NW",
  "ICE_CORNER_SE",
  "ICE_CORNER_SW",
  "SWIVEL_DOOR_NE",
  "SWIVEL_DOOR_NW",
  "SWIVEL_DOOR_SE",
  "SWIVEL_DOOR_SW",
]);

const TERRAIN_GROUPS: ReadonlyArray<ReadonlyArray<string>> = Object.freeze([
  [
    "FLOOR",
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
  ["ICE", "ICE_CORNER"],
  ["FORCE_FLOOR", "FORCE_RANDOM"],
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
  [
    "TRAP",
    "OPEN_TRAP_UNUSED",
    "CLONE_MACHINE",
    "RAILROAD_TRACK:line",
    "RAILROAD_TRACK:corner",
    "RAILROAD_TRACK:switch",
    "LOGIC_GATE:INVERTER",
    "LOGIC_GATE:AND",
    "LOGIC_GATE:OR",
    "LOGIC_GATE:XOR",
    "LOGIC_GATE:LATCH_CW",
    "LOGIC_GATE:LATCH_CCW",
    "LOGIC_GATE:NAND",
    "LOGIC_GATE:COUNTER",
    "WIRE_TUNNEL",
    "RAILROAD_SIGN",
  ],
  [
    "GREEN_TOGGLE_FLOOR",
    "GREEN_TOGGLE_WALL",
    "PURPLE_TOGGLE_FLOOR",
    "PURPLE_TOGGLE_WALL",
    "CUSTOM_FLOOR",
    "CUSTOM_WALL",
    "LETTER_TILE",
    "TURTLE",
    "SWIVEL_DOOR",
    "MALE_ONLY_SIGN",
    "FEMALE_ONLY_SIGN",
    "CLUE",
    "FLAME_JET_OFF",
    "FLAME_JET_ON",
  ],
]);

const ITEM_GROUPS: ReadonlyArray<ReadonlyArray<string>> = Object.freeze([
  ["RED_KEY", "BLUE_KEY", "YELLOW_KEY", "GREEN_KEY"],
  [
    "FLIPPERS",
    "FIRE_BOOTS",
    "SUCTION_BOOTS",
    "CLEATS",
    "HIKING_BOOTS",
    "LIGHTNING_BOLT",
    "HELMET",
    "SPEED_BOOTS",
    "HOOK",
    "STEEL_FOIL",
  ],
  ["IC_CHIP", "EXTRA_IC_CHIP", "GREEN_CHIP", "GREEN_BOMB", "CHERRY_BOMB"],
  ["TIME_BONUS", "TIME_PENALTY", "STOPWATCH", "TIME_BOMB"],
  ["FLAG_10", "FLAG_100", "FLAG_1000", "FLAG_2X"],
  ["BOWLING_BALL", "THIEF_BRIBE", "SECRET_EYE", "RAILROAD_SIGN"],
]);

const TERRAIN_GROUP_ORDER = new Map(
  TERRAIN_GROUPS.flatMap((group, groupIndex) =>
    group.map((key, itemIndex) => [key, groupIndex * 100 + itemIndex] as const),
  ),
);

const ITEM_GROUP_ORDER = new Map(
  ITEM_GROUPS.flatMap((group, groupIndex) =>
    group.map((key, itemIndex) => [key, groupIndex * 100 + itemIndex] as const),
  ),
);

function rotateBrushSteps(brush: TileSpecJson, steps: number): TileSpecJson {
  let current = brush;
  for (let index = 0; index < steps; index += 1) {
    current = rotateBrushSpec(current, "clockwise") ?? current;
  }
  return current;
}

function orientBrush(brush: TileSpecJson, direction: Dir): TileSpecJson {
  return rotateBrushSteps(brush, DIR_ORDER.indexOf(direction));
}

function makeBrushEntry(
  key: string,
  sectionKey: PaletteSectionKey,
  tile: TileSpecJson,
  label: string,
  searchText: string,
  order: number,
  allowSecondaryAssign = true,
): PaletteBrushEntry {
  return {
    kind: "brush",
    key,
    sectionKey,
    tile,
    label,
    searchText,
    order,
    allowSecondaryAssign,
  };
}

function makeToolEntry(
  key: string,
  sectionKey: PaletteSectionKey,
  label: string,
  searchText: string,
  order: number,
  previewSpriteCell: Readonly<{ x: number; y: number }>,
): PaletteToolEntry {
  return {
    kind: "tool",
    key,
    sectionKey,
    tool: "wire",
    previewSpriteCell,
    label,
    searchText,
    order,
    allowSecondaryAssign: false,
  };
}

function makeRailroadEntries(direction: Dir): PaletteBrushEntry[] {
  const lineBase: TileSpecJson = {
    tile: "RAILROAD_TRACK",
    modifiers: [{ kind: "TRACKS", pieces: ["VERTICAL"], active: "V", entered: "N" }],
  };
  const cornerBase: TileSpecJson = {
    tile: "RAILROAD_TRACK",
    modifiers: [{ kind: "TRACKS", pieces: ["TURN_NE"], active: "NE", entered: "N" }],
  };
  const switchBrush: TileSpecJson = {
    tile: "RAILROAD_TRACK",
    modifiers: [{ kind: "TRACKS", pieces: ["SWITCH"], active: "V", entered: "N" }],
  };

  return [
    makeBrushEntry(
      "RAILROAD_TRACK:line",
      "terrain",
      orientBrush(lineBase, direction),
      "Railroad Track",
      "railroad track line vertical horizontal",
      800,
    ),
    makeBrushEntry(
      "RAILROAD_TRACK:corner",
      "terrain",
      orientBrush(cornerBase, direction),
      "Railroad Corner",
      "railroad track corner",
      801,
    ),
    makeBrushEntry(
      "RAILROAD_TRACK:switch",
      "terrain",
      switchBrush,
      "Railroad Switch",
      "railroad switch track",
      802,
    ),
  ];
}

function makeDirectionalBlockEntries(direction: Dir): PaletteBrushEntry[] {
  const one = direction;
  const clockwise = DIR_ORDER[(DIR_ORDER.indexOf(direction) + 1) % DIR_ORDER.length] ?? direction;
  const opposite = DIR_ORDER[(DIR_ORDER.indexOf(direction) + 2) % DIR_ORDER.length] ?? direction;
  const counterclockwise =
    DIR_ORDER[(DIR_ORDER.indexOf(direction) + 3) % DIR_ORDER.length] ?? direction;

  const build = (key: string, label: string, arrows: ReadonlyArray<Dir>, order: number) =>
    makeBrushEntry(
      key,
      "mob",
      {
        tile: "DIRECTIONAL_BLOCK",
        dir: direction,
        directionalArrows: { arrows: [...arrows] },
        lower: "FLOOR",
      },
      label,
      `${label} directional block ${arrows.join(" ")}`,
      order,
    );

  return [
    build("DIRECTIONAL_BLOCK:0", "Directional Block (0 Directions)", [], 9000),
    build("DIRECTIONAL_BLOCK:1", "Directional Block (1 Direction)", [one], 9001),
    build("DIRECTIONAL_BLOCK:2-adj", "Directional Block (2 Adjacent)", [one, clockwise], 9002),
    build("DIRECTIONAL_BLOCK:2-opp", "Directional Block (2 Opposite)", [one, opposite], 9003),
    build(
      "DIRECTIONAL_BLOCK:3",
      "Directional Block (3 Directions)",
      [one, clockwise, opposite],
      9004,
    ),
    build(
      "DIRECTIONAL_BLOCK:4",
      "Directional Block (4 Directions)",
      [one, clockwise, opposite, counterclockwise],
      9005,
    ),
  ];
}

function makeLogicGateEntries(direction: Dir, counterValue: number): PaletteBrushEntry[] {
  const gates: ReadonlyArray<LogicGate> = Object.freeze([
    "INVERTER",
    "AND",
    "OR",
    "XOR",
    "LATCH_CW",
    "LATCH_CCW",
    "NAND",
    "COUNTER",
  ]);

  return gates.map((gate, index) => {
    const logicModifier: Extract<ModifierJson, { kind: "LOGIC" }> =
      gate === "COUNTER"
        ? { kind: "LOGIC", gate, counterValue }
        : { kind: "LOGIC", gate, facing: direction };
    const gateTile = {
      tile: "LOGIC_GATE",
      modifiers: [
        {
          kind: "WIRES",
          wires: resolveRequiredWireDirections({
            tile: "LOGIC_GATE",
            modifiers: [logicModifier],
          }),
          tunnels: [],
        },
        logicModifier,
      ],
    } satisfies TileSpecJson;

    return makeBrushEntry(
      `LOGIC_GATE:${gate}`,
      "terrain",
      gateTile,
      gate === "COUNTER" ? "Logic Gate (Counter)" : `Logic Gate (${formatTileDisplayName(gate)})`,
      `logic gate ${gate.toLowerCase()} counter`,
      803 + index,
    );
  });
}

function makeWireTunnelEntry(direction: Dir): PaletteBrushEntry {
  const tunnelBase: TileSpecJson = {
    tile: "FLOOR",
    modifiers: [{ kind: "WIRES", wires: ["N"], tunnels: ["N"] }],
  };

  return makeBrushEntry(
    "WIRE_TUNNEL",
    "terrain",
    orientBrush(tunnelBase, direction),
    "Wire Tunnel",
    "wire tunnel underground wire",
    TERRAIN_GROUP_ORDER.get("WIRE_TUNNEL") ?? 814,
  );
}

function resolveBasePaletteTile(tileName: string, direction: Dir): TileSpecJson {
  if (classifyTileLayer(tileName) === "mob") {
    return orientBrush(createDefaultBrushTileSpec(tileName), direction);
  }

  return createDefaultBrushTileSpec(tileName);
}

function makeTemplateEntries(direction: Dir, counterValue: number): PaletteTileEntry[] {
  return [
    makeBrushEntry(
      "ICE_CORNER",
      "terrain",
      orientBrush("ICE_CORNER_NE", direction),
      "Ice Corner",
      "ice corner",
      300,
    ),
    makeBrushEntry(
      "FORCE_FLOOR",
      "terrain",
      orientBrush("FORCE_N", direction),
      "Force Floor",
      "force floor",
      400,
    ),
    makeBrushEntry(
      "SWIVEL_DOOR",
      "terrain",
      orientBrush("SWIVEL_DOOR_NE", direction),
      "Swivel Door",
      "swivel door",
      TERRAIN_GROUP_ORDER.get("SWIVEL_DOOR") ?? 908,
    ),
    makeBrushEntry(
      "THINWALL_CANOPY",
      "overlay",
      orientBrush(
        {
          tile: "THINWALL_CANOPY",
          thinWallCanopy: {
            walls: ["N"],
            canopy: false,
          },
          lower: "FLOOR",
        },
        direction,
      ),
      "Thin Wall",
      "thin wall canopy",
      40000,
    ),
    ...makeRailroadEntries(direction),
    ...makeLogicGateEntries(direction, counterValue),
    makeWireTunnelEntry(direction),
    ...makeDirectionalBlockEntries(direction),
    makeToolEntry("WIRE_TOOL", "tool", "Wire Tool", "wire tool spool", 99999, { x: 12, y: 26 }),
  ];
}

function terrainSortOrder(entryKey: string): number {
  return TERRAIN_GROUP_ORDER.get(entryKey) ?? 10000;
}

function itemSortOrder(entryKey: string): number {
  return ITEM_GROUP_ORDER.get(entryKey) ?? 20000;
}

function buildBaseEntry(tileName: string, direction: Dir): PaletteBrushEntry {
  const tile = resolveBasePaletteTile(tileName, direction);
  const label = formatTileDisplayName(tileName);
  const sectionKey = sectionKeyForTile(tileName);
  const order =
    sectionKey === "terrain"
      ? terrainSortOrder(tileName)
      : sectionKey === "item"
        ? itemSortOrder(tileName)
        : sectionKey === "mob"
          ? 30000
          : 40000;

  return makeBrushEntry(
    tileName,
    sectionKey,
    tile,
    label,
    `${tileName} ${label} ${describeTileSpec(tile) ?? ""}`,
    order,
  );
}

function matchesQuery(entry: PaletteTileEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return true;
  return entry.searchText.toLowerCase().includes(normalizedQuery);
}

function sectionKeyForTile(tileName: string): PaletteSectionKey {
  const layer = classifyTileLayer(tileName);
  if (layer === "item") return "item";
  if (layer === "mob") return "mob";
  if (layer === "noSign" || layer === "thinWalls") return "overlay";
  return "terrain";
}

function buildPaletteEntries(direction: Dir, counterValue: number): PaletteTileEntry[] {
  const entries: PaletteTileEntry[] = [...makeTemplateEntries(direction, counterValue)];

  for (const tileName of C2M_PAINTABLE_TILE_NAMES) {
    if (EXCLUDED_TILE_NAMES.has(tileName) || TEMPLATE_REPLACED_TILE_NAMES.has(tileName)) continue;
    entries.push(buildBaseEntry(tileName, direction));
  }

  return entries;
}

export function getPaletteSections(options: PaletteSectionsOptions): PaletteTileSection[] {
  const direction = options.globalDirection ?? "N";
  const counterValue = options.logicCounterValue ?? 0;
  const bySection = new Map<PaletteSectionKey, PaletteTileEntry[]>();

  for (const entry of buildPaletteEntries(direction, counterValue)) {
    if (!matchesQuery(entry, options.query)) continue;
    const sectionTiles = bySection.get(entry.sectionKey);
    if (sectionTiles) sectionTiles.push(entry);
    else bySection.set(entry.sectionKey, [entry]);
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
