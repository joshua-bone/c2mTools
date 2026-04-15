import { C2M_PAINTABLE_TILE_NAMES, classifyTileLayer } from "../../src/c2m/cellStack.js";
import { formatTileDisplayName } from "./editor/tileDisplay.js";

export type PaletteTileSection = Readonly<{
  key: string;
  title: string;
  tiles: ReadonlyArray<string>;
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

function matchesQuery(tileName: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return true;

  return `${tileName} ${formatTileDisplayName(tileName)}`.toLowerCase().includes(normalizedQuery);
}

function sectionKeyForTile(tileName: string): (typeof SECTION_ORDER)[number] {
  const layer = classifyTileLayer(tileName);
  if (layer === "item") return "item";
  if (layer === "mob") return "mob";
  if (layer === "noSign" || layer === "thinWalls") return "overlay";
  return "terrain";
}

export function getPaletteSections(options: PaletteSectionsOptions): PaletteTileSection[] {
  const bySection = new Map<(typeof SECTION_ORDER)[number], string[]>();

  for (const tileName of C2M_PAINTABLE_TILE_NAMES) {
    if (!matchesQuery(tileName, options.query)) continue;

    const sectionKey = sectionKeyForTile(tileName);
    const sectionTiles = bySection.get(sectionKey);
    if (sectionTiles) {
      sectionTiles.push(tileName);
      continue;
    }

    bySection.set(sectionKey, [tileName]);
  }

  return SECTION_ORDER.flatMap((sectionKey) => {
    const tiles = bySection.get(sectionKey);
    if (!tiles || tiles.length === 0) return [];

    return [
      {
        key: sectionKey,
        title: SECTION_TITLES[sectionKey],
        tiles,
      },
    ];
  });
}
