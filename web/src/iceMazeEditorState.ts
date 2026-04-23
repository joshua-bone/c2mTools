import { buildCellFromLayers, flattenCellLayers } from "../../src/c2m/cellStack.js";
import type { MapJson, TileSpecJson } from "../../src/c2m/mapCodec.js";
import {
  createProceduralRegion,
  type GridPoint,
  type ProceduralRegion,
  type ProceduralRegionInput,
} from "../../procedural_generation/ice_maze.js";
import { pointToIndex } from "./editor/boardGeometry.js";

export type IceMazeRegionCell = "blocked" | "allowed" | "reserved";
export type IceMazeAnchorKind = "entry" | "exit";

export type IceMazeEditorBrush =
  | Readonly<{
      kind: "terrain";
      tile: TileSpecJson;
    }>
  | Readonly<{
      kind: "item";
      itemTile: "IC_CHIP" | null;
    }>
  | Readonly<{
      kind: "region";
      regionCell: IceMazeRegionCell;
    }>
  | Readonly<{
      kind: "anchor";
      anchor: IceMazeAnchorKind;
    }>
  | Readonly<{
      kind: "anchor-clear";
    }>;

export type IceMazeEditorAnchors = Readonly<{
  entry: GridPoint | null;
  exit: GridPoint | null;
}>;

type MutableIceMazeEditorAnchors = {
  entry: GridPoint | null;
  exit: GridPoint | null;
};

export type IceMazeEditorState = Readonly<{
  map: MapJson;
  regionCells: ReadonlyArray<IceMazeRegionCell>;
  anchors: IceMazeEditorAnchors;
}>;

export const DEFAULT_ICE_MAZE_WIDTH = 16;
export const DEFAULT_ICE_MAZE_HEIGHT = 12;

function clonePoint(point: GridPoint | null): GridPoint | null {
  return point ? { x: point.x, y: point.y } : null;
}

function cloneAnchors(anchors: IceMazeEditorAnchors): MutableIceMazeEditorAnchors {
  return {
    entry: clonePoint(anchors.entry),
    exit: clonePoint(anchors.exit),
  };
}

function createMap(width: number, height: number, fill: TileSpecJson): MapJson {
  return {
    width,
    height,
    tiles: Array<TileSpecJson>(width * height).fill(fill),
  };
}

function setTerrainTile(map: MapJson, point: GridPoint, terrain: TileSpecJson): MapJson {
  const tiles = [...map.tiles];
  tiles[pointToIndex(point, map)] = buildCellFromLayers({
    terrain: typeof terrain === "string" ? { tile: terrain } : terrain,
  });
  return {
    width: map.width,
    height: map.height,
    tiles,
  };
}

function setItemTile(map: MapJson, point: GridPoint, itemTile: string | null): MapJson {
  const index = pointToIndex(point, map);
  const layers = flattenCellLayers(map.tiles[index]!);
  const terrain = layers.terrain.tile === "WALL" ? { tile: "FLOOR" } : layers.terrain;
  const tiles = [...map.tiles];
  tiles[index] = buildCellFromLayers({
    terrain,
    ...(itemTile ? { item: { tile: itemTile } } : {}),
  });
  return {
    width: map.width,
    height: map.height,
    tiles,
  };
}

function fillInteriorRegionCells(width: number, height: number): IceMazeRegionCell[] {
  const cells: IceMazeRegionCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push(x === 0 || y === 0 || x === width - 1 || y === height - 1 ? "blocked" : "allowed");
    }
  }
  return cells;
}

function fillBorderWalls(map: MapJson): MapJson {
  let nextMap = map;
  for (let x = 0; x < map.width; x += 1) {
    nextMap = setTerrainTile(nextMap, { x, y: 0 }, "WALL");
    nextMap = setTerrainTile(nextMap, { x, y: map.height - 1 }, "WALL");
  }
  for (let y = 0; y < map.height; y += 1) {
    nextMap = setTerrainTile(nextMap, { x: 0, y }, "WALL");
    nextMap = setTerrainTile(nextMap, { x: map.width - 1, y }, "WALL");
  }
  return nextMap;
}

export function createEmptyIceMazeEditorState(
  width = DEFAULT_ICE_MAZE_WIDTH,
  height = DEFAULT_ICE_MAZE_HEIGHT,
): IceMazeEditorState {
  return {
    map: fillBorderWalls(createMap(width, height, "FLOOR")),
    regionCells: fillInteriorRegionCells(width, height),
    anchors: {
      entry: null,
      exit: null,
    },
  };
}

export function createSampleIceMazeEditorState(): IceMazeEditorState {
  let state = createEmptyIceMazeEditorState();
  const terrainPoints: ReadonlyArray<Readonly<{ point: GridPoint; tile: TileSpecJson }>> = [
    { point: { x: 4, y: 2 }, tile: "WALL" },
    { point: { x: 5, y: 2 }, tile: "WALL" },
    { point: { x: 6, y: 2 }, tile: "WALL" },
    { point: { x: 4, y: 3 }, tile: "WALL" },
    { point: { x: 6, y: 3 }, tile: "WALL" },
    { point: { x: 8, y: 3 }, tile: "WALL" },
    { point: { x: 4, y: 4 }, tile: "WALL" },
    { point: { x: 8, y: 4 }, tile: "WALL" },
    { point: { x: 2, y: 5 }, tile: "ICE" },
    { point: { x: 3, y: 5 }, tile: "ICE" },
    { point: { x: 4, y: 5 }, tile: "ICE_CORNER_NE" },
    { point: { x: 4, y: 6 }, tile: "ICE" },
    { point: { x: 4, y: 7 }, tile: "ICE_CORNER_SW" },
    { point: { x: 3, y: 7 }, tile: "ICE" },
    { point: { x: 2, y: 7 }, tile: "ICE_CORNER_NW" },
    { point: { x: 2, y: 6 }, tile: "ICE" },
    { point: { x: 6, y: 5 }, tile: "ICE" },
    { point: { x: 7, y: 5 }, tile: "ICE_CORNER_NE" },
    { point: { x: 7, y: 6 }, tile: "ICE" },
    { point: { x: 7, y: 7 }, tile: "ICE_CORNER_SW" },
    { point: { x: 6, y: 7 }, tile: "ICE" },
    { point: { x: 5, y: 7 }, tile: "ICE" },
    { point: { x: 8, y: 7 }, tile: "CHIP_SOCKET" },
    { point: { x: 10, y: 7 }, tile: "EXIT" },
  ];

  for (const { point, tile } of terrainPoints) {
    state = {
      ...state,
      map: setTerrainTile(state.map, point, tile),
    };
  }

  state = {
    ...state,
    map: setItemTile(state.map, { x: 2, y: 5 }, "IC_CHIP"),
    anchors: {
      entry: { x: 1, y: 5 },
      exit: { x: 10, y: 7 },
    },
  };

  return state;
}

function resizeMapPreservingCells(map: MapJson, width: number, height: number): MapJson {
  const tiles = Array<TileSpecJson>(width * height).fill("WALL");
  for (let y = 0; y < Math.min(map.height, height); y += 1) {
    for (let x = 0; x < Math.min(map.width, width); x += 1) {
      tiles[y * width + x] = map.tiles[y * map.width + x]!;
    }
  }

  return {
    width,
    height,
    tiles,
  };
}

export function resizeIceMazeEditorState(
  state: IceMazeEditorState,
  width: number,
  height: number,
): IceMazeEditorState {
  const nextMap = resizeMapPreservingCells(state.map, width, height);
  const nextRegionCells = Array<IceMazeRegionCell>(width * height).fill("blocked");

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nextIndex = y * width + x;
      if (x < state.map.width && y < state.map.height) {
        nextRegionCells[nextIndex] = state.regionCells[y * state.map.width + x] ?? "blocked";
        continue;
      }

      nextRegionCells[nextIndex] =
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ? "blocked" : "allowed";
    }
  }

  const anchors: IceMazeEditorAnchors = {
    entry:
      state.anchors.entry && state.anchors.entry.x < width && state.anchors.entry.y < height
        ? state.anchors.entry
        : null,
    exit:
      state.anchors.exit && state.anchors.exit.x < width && state.anchors.exit.y < height
        ? state.anchors.exit
        : null,
  };

  return {
    map: fillBorderWalls(nextMap),
    regionCells: nextRegionCells,
    anchors,
  };
}

export function applyIceMazeEditorBrush(
  state: IceMazeEditorState,
  point: GridPoint,
  brush: IceMazeEditorBrush,
): IceMazeEditorState {
  if (point.x < 0 || point.y < 0 || point.x >= state.map.width || point.y >= state.map.height) {
    return state;
  }

  const index = pointToIndex(point, state.map);
  if (brush.kind === "terrain") {
    return {
      ...state,
      map: setTerrainTile(state.map, point, brush.tile),
    };
  }

  if (brush.kind === "item") {
    return {
      ...state,
      map: setItemTile(state.map, point, brush.itemTile),
    };
  }

  if (brush.kind === "region") {
    const regionCells = [...state.regionCells];
    regionCells[index] = brush.regionCell;
    const anchors = cloneAnchors(state.anchors);
    if (brush.regionCell === "blocked") {
      if (anchors.entry?.x === point.x && anchors.entry.y === point.y) anchors.entry = null;
      if (anchors.exit?.x === point.x && anchors.exit.y === point.y) anchors.exit = null;
    }
    return {
      ...state,
      regionCells,
      anchors,
    };
  }

  if (brush.kind === "anchor-clear") {
    const anchors = cloneAnchors(state.anchors);
    if (anchors.entry?.x === point.x && anchors.entry.y === point.y) anchors.entry = null;
    if (anchors.exit?.x === point.x && anchors.exit.y === point.y) anchors.exit = null;
    return {
      ...state,
      anchors,
    };
  }

  const regionCells = [...state.regionCells];
  regionCells[index] = "allowed";
  const anchors = cloneAnchors(state.anchors);
  if (brush.anchor === "entry") {
    anchors.entry = { x: point.x, y: point.y };
    if (anchors.exit?.x === point.x && anchors.exit.y === point.y) anchors.exit = null;
  } else {
    anchors.exit = { x: point.x, y: point.y };
    if (anchors.entry?.x === point.x && anchors.entry.y === point.y) anchors.entry = null;
  }

  return {
    ...state,
    regionCells,
    anchors,
  };
}

export function buildIceMazeRegionInput(
  state: IceMazeEditorState,
  name = "ice-maze-lab",
): ProceduralRegionInput {
  const allowedPoints: GridPoint[] = [];
  const reservedPoints: GridPoint[] = [];

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const regionCell = state.regionCells[y * state.map.width + x] ?? "blocked";
      if (regionCell === "blocked") continue;
      allowedPoints.push({ x, y });
      if (regionCell === "reserved") reservedPoints.push({ x, y });
    }
  }

  return {
    name,
    board: {
      width: state.map.width,
      height: state.map.height,
    },
    mask: {
      kind: "points",
      points: allowedPoints,
    },
    reservedPoints,
    anchors: [
      ...(state.anchors.entry
        ? [
            {
              id: "entry",
              kind: "entry" as const,
              point: state.anchors.entry,
            },
          ]
        : []),
      ...(state.anchors.exit
        ? [
            {
              id: "exit",
              kind: "exit" as const,
              point: state.anchors.exit,
            },
          ]
        : []),
    ],
  };
}

export function buildIceMazeRegion(
  state: IceMazeEditorState,
  name = "ice-maze-lab",
): ProceduralRegion {
  return createProceduralRegion(buildIceMazeRegionInput(state, name));
}
