import { wallGridFromMaskBytes, wallMaskBytesFromKey, type WallGrid } from "dattools/walls-core";

import type { MapJson, TileSpecJson } from "../../src/c2m/mapCodec";

const FLOOR_TILE: TileSpecJson = "FLOOR";
const WALL_TILE: TileSpecJson = "WALL";

function buildMapFromWallCells(
  width: number,
  height: number,
  readWallAt: (x: number, y: number) => boolean,
): MapJson {
  const tiles: TileSpecJson[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push(readWallAt(x, y) ? WALL_TILE : FLOOR_TILE);
    }
  }
  return {
    width,
    height,
    tiles,
  };
}

function resolveCenteredCopyPlan(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Readonly<{
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  copyWidth: number;
  copyHeight: number;
}> {
  const copyWidth = Math.min(sourceWidth, targetWidth);
  const copyHeight = Math.min(sourceHeight, targetHeight);
  return {
    sourceX: Math.max(0, Math.floor((sourceWidth - copyWidth) / 2)),
    sourceY: Math.max(0, Math.floor((sourceHeight - copyHeight) / 2)),
    targetX: Math.max(0, Math.floor((targetWidth - copyWidth) / 2)),
    targetY: Math.max(0, Math.floor((targetHeight - copyHeight) / 2)),
    copyWidth,
    copyHeight,
  };
}

export function applyGeneratedWallGridToC2mMap(grid: WallGrid): MapJson {
  return buildMapFromWallCells(
    grid.width,
    grid.height,
    (x, y) => grid.cells[y * grid.width + x] === 1,
  );
}

export function applyBankWallMask32ToC2mMap(currentMap: MapJson, wallKey: string): MapJson {
  const sourceGrid = wallGridFromMaskBytes(wallMaskBytesFromKey(wallKey));
  const copyPlan = resolveCenteredCopyPlan(
    sourceGrid.width,
    sourceGrid.height,
    currentMap.width,
    currentMap.height,
  );

  return buildMapFromWallCells(currentMap.width, currentMap.height, (x, y) => {
    const relativeX = x - copyPlan.targetX;
    const relativeY = y - copyPlan.targetY;
    if (
      relativeX < 0 ||
      relativeY < 0 ||
      relativeX >= copyPlan.copyWidth ||
      relativeY >= copyPlan.copyHeight
    ) {
      return false;
    }
    const sourceX = copyPlan.sourceX + relativeX;
    const sourceY = copyPlan.sourceY + relativeY;
    return sourceGrid.cells[sourceY * sourceGrid.width + sourceX] === 1;
  });
}
