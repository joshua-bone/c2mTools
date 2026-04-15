import { cloneTileSpec } from "../../../src/c2m/cellStack.js";
import type { MapJson, TileSpecJson } from "../../../src/c2m/mapCodec.js";
import { MAX_C2M_MAP_SIZE, MIN_C2M_MAP_SIZE } from "./createEmptyC2mDoc.js";

export type ResizeAnchor = "NW" | "N" | "NE" | "W" | "C" | "E" | "SW" | "S" | "SE";
export type ResizeEdge = "N" | "E" | "S" | "W";

export type MapResizeDraft = Readonly<{
  width: string;
  height: string;
  anchor: ResizeAnchor;
}>;

function parseDimension(label: string, value: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be an integer`);
  }

  const parsed = Number(trimmed);
  if (parsed < MIN_C2M_MAP_SIZE || parsed > MAX_C2M_MAP_SIZE) {
    throw new Error(
      `${label} must be between ${MIN_C2M_MAP_SIZE} and ${MAX_C2M_MAP_SIZE} inclusive`,
    );
  }

  return parsed;
}

function resolveAxisOffset(
  oldSize: number,
  nextSize: number,
  alignment: "start" | "center" | "end",
): Readonly<{ source: number; target: number; length: number }> {
  const length = Math.min(oldSize, nextSize);

  if (alignment === "start") {
    return { source: 0, target: 0, length };
  }

  if (alignment === "end") {
    return {
      source: Math.max(0, oldSize - length),
      target: Math.max(0, nextSize - length),
      length,
    };
  }

  return {
    source: Math.max(0, Math.floor((oldSize - length) / 2)),
    target: Math.max(0, Math.floor((nextSize - length) / 2)),
    length,
  };
}

function resolveAnchorAlignment(
  anchor: ResizeAnchor,
): Readonly<{ x: "start" | "center" | "end"; y: "start" | "center" | "end" }> {
  switch (anchor) {
    case "NW":
      return { x: "start", y: "start" };
    case "N":
      return { x: "center", y: "start" };
    case "NE":
      return { x: "end", y: "start" };
    case "W":
      return { x: "start", y: "center" };
    case "C":
      return { x: "center", y: "center" };
    case "E":
      return { x: "end", y: "center" };
    case "SW":
      return { x: "start", y: "end" };
    case "S":
      return { x: "center", y: "end" };
    case "SE":
      return { x: "end", y: "end" };
  }
}

export function makeMapResizeDraft(map: MapJson): MapResizeDraft {
  return {
    width: String(map.width),
    height: String(map.height),
    anchor: "NW",
  };
}

export function resizeDraftEquals(a: MapResizeDraft, b: MapResizeDraft): boolean {
  return a.width === b.width && a.height === b.height && a.anchor === b.anchor;
}

export function parseMapResizeDraft(draft: MapResizeDraft): Readonly<{
  width: number;
  height: number;
  anchor: ResizeAnchor;
}> {
  return {
    width: parseDimension("width", draft.width),
    height: parseDimension("height", draft.height),
    anchor: draft.anchor,
  };
}

export function resizeMap(
  map: MapJson,
  options: Readonly<{
    width: number;
    height: number;
    anchor?: ResizeAnchor;
    fillTile?: TileSpecJson;
  }>,
): MapJson {
  if (
    map.width === options.width &&
    map.height === options.height &&
    (options.anchor ?? "NW") === "NW"
  ) {
    return map;
  }

  if (
    options.width < MIN_C2M_MAP_SIZE ||
    options.width > MAX_C2M_MAP_SIZE ||
    options.height < MIN_C2M_MAP_SIZE ||
    options.height > MAX_C2M_MAP_SIZE
  ) {
    throw new Error(
      `map size must stay between ${MIN_C2M_MAP_SIZE} and ${MAX_C2M_MAP_SIZE} inclusive`,
    );
  }

  const fillTile = options.fillTile ?? "FLOOR";
  const nextTiles = Array.from({ length: options.width * options.height }, () =>
    cloneTileSpec(fillTile),
  );
  const alignment = resolveAnchorAlignment(options.anchor ?? "NW");
  const xOffset = resolveAxisOffset(map.width, options.width, alignment.x);
  const yOffset = resolveAxisOffset(map.height, options.height, alignment.y);

  for (let y = 0; y < yOffset.length; y += 1) {
    for (let x = 0; x < xOffset.length; x += 1) {
      const sourceIndex = (yOffset.source + y) * map.width + (xOffset.source + x);
      const targetIndex = (yOffset.target + y) * options.width + (xOffset.target + x);
      const tile = map.tiles[sourceIndex];
      if (tile === undefined) continue;
      nextTiles[targetIndex] = cloneTileSpec(tile);
    }
  }

  return {
    width: options.width,
    height: options.height,
    tiles: nextTiles,
  };
}

function resolveEdgeAnchor(edge: ResizeEdge): ResizeAnchor {
  switch (edge) {
    case "N":
      return "S";
    case "E":
      return "W";
    case "S":
      return "N";
    case "W":
      return "E";
  }
}

export function canResizeMapEdge(
  map: Readonly<Pick<MapJson, "width" | "height">>,
  edge: ResizeEdge,
  delta: -1 | 1,
): boolean {
  const axisSize = edge === "N" || edge === "S" ? map.height : map.width;
  const nextSize = axisSize + delta;
  return nextSize >= MIN_C2M_MAP_SIZE && nextSize <= MAX_C2M_MAP_SIZE;
}

export function resizeMapEdge(
  map: MapJson,
  options: Readonly<{
    edge: ResizeEdge;
    delta: -1 | 1;
    fillTile?: TileSpecJson;
  }>,
): MapJson {
  if (!canResizeMapEdge(map, options.edge, options.delta)) {
    return map;
  }

  return resizeMap(map, {
    width: options.edge === "E" || options.edge === "W" ? map.width + options.delta : map.width,
    height: options.edge === "N" || options.edge === "S" ? map.height + options.delta : map.height,
    anchor: resolveEdgeAnchor(options.edge),
    ...(options.fillTile !== undefined ? { fillTile: options.fillTile } : {}),
  });
}
