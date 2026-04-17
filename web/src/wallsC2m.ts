import { wallGridFromMaskBytes, wallMaskBytesFromKey, type WallGrid } from "dattools/walls-core";

import type { MapJson, TileSpecJson } from "../../src/c2m/mapCodec.js";

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

export function applyGeneratedWallGridToC2mMap(grid: WallGrid): MapJson {
  return buildMapFromWallCells(
    grid.width,
    grid.height,
    (x, y) => grid.cells[y * grid.width + x] === 1,
  );
}

export function applyBankWallMask32ToC2mMap(wallKey: string): MapJson {
  const sourceGrid = wallGridFromMaskBytes(wallMaskBytesFromKey(wallKey));
  return buildMapFromWallCells(
    sourceGrid.width,
    sourceGrid.height,
    (x, y) => sourceGrid.cells[y * sourceGrid.width + x] === 1,
  );
}
