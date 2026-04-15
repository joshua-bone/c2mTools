import type { MapJson } from "../../src/c2m/mapCodec.js";

const MAX_THUMBNAIL_DIMENSION = 208;
const THUMBNAIL_TILE_PIXEL_SIZES = [32, 16, 8, 4, 2, 1] as const;

export function resolveRecentLevelThumbnailTileSize(
  map: Readonly<Pick<MapJson, "width" | "height">>,
  maxDimension = MAX_THUMBNAIL_DIMENSION,
): number {
  const largestMapDimension = Math.max(map.width, map.height);

  return (
    THUMBNAIL_TILE_PIXEL_SIZES.find((tileSize) => largestMapDimension * tileSize <= maxDimension) ??
    1
  );
}
