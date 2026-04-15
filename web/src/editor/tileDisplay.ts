import type { ModifierJson, TileSpecJson, TileSpecObjJson } from "../../../src/c2m/mapCodec.js";

function formatTileNameSegment(segment: string): string {
  if (segment === "IC") return "IC";
  if (segment === "NE") return "NE";
  if (segment === "NW") return "NW";
  if (segment === "SE") return "SE";
  if (segment === "SW") return "SW";
  if (segment === "NWSE") return "NW/SE";
  if (segment === "NESW") return "NE/SW";
  if (segment === "2X") return "2x";
  if (/^\d+$/.test(segment)) return segment;
  return segment.slice(0, 1) + segment.slice(1).toLowerCase();
}

function summarizeModifier(modifier: ModifierJson): string | null {
  switch (modifier.kind) {
    case "LETTER_SYMBOL":
      return `"${modifier.symbol}"`;
    case "CUSTOM_STYLE":
      return modifier.style.toLowerCase();
    case "LOGIC":
      return modifier.gate === "COUNTER"
        ? `counter ${modifier.counterValue ?? 0}`
        : `${modifier.gate.toLowerCase()} ${modifier.facing ?? "N"}`;
    case "TRACKS":
      return modifier.pieces.length > 0 ? modifier.pieces.join("/") : "tracks";
    case "CLONE_ARROWS":
      return modifier.arrows.length > 0 ? modifier.arrows.join("/") : null;
    case "WIRES": {
      const parts: string[] = [];
      if (modifier.wires.length > 0) parts.push(`wires ${modifier.wires.join("/")}`);
      if (modifier.tunnels.length > 0) parts.push(`tunnels ${modifier.tunnels.join("/")}`);
      return parts.length > 0 ? parts.join(", ") : null;
    }
  }
}

export function toTileSpecObj(spec: TileSpecJson): TileSpecObjJson {
  return typeof spec === "string" ? { tile: spec } : spec;
}

export function getTileSpecName(spec: string | TileSpecJson): string {
  return typeof spec === "string" ? spec : spec.tile;
}

export function formatTileDisplayName(tileName: string): string {
  return tileName.split("_").map(formatTileNameSegment).join(" ");
}

export function describeTileSpec(spec: TileSpecJson | TileSpecObjJson | undefined): string | null {
  if (!spec) return null;

  const tile = toTileSpecObj(spec);
  const details: string[] = [];

  if (tile.dir) details.push(tile.dir);

  if (tile.thinWallCanopy) {
    if (tile.thinWallCanopy.walls.length > 0) details.push(tile.thinWallCanopy.walls.join("/"));
    if (tile.thinWallCanopy.canopy) details.push("canopy");
  }

  if (tile.directionalArrows && tile.directionalArrows.arrows.length > 0) {
    details.push(tile.directionalArrows.arrows.join("/"));
  }

  for (const modifier of tile.modifiers ?? []) {
    const summary = summarizeModifier(modifier);
    if (summary) details.push(summary);
  }

  return details.length > 0
    ? `${formatTileDisplayName(tile.tile)} (${details.join(", ")})`
    : formatTileDisplayName(tile.tile);
}
