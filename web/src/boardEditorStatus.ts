import { flattenCellLayers, type C2mCellLayerName } from "../../src/c2m/cellStack.js";
import type { MapJson } from "../../src/c2m/mapCodec.js";
import type { GridPoint } from "./editor/boardGeometry.js";
import { pointToIndex } from "./editor/boardGeometry.js";
import { describeTileSpec } from "./editor/tileDisplay.js";

export type HoverCellLayerSummary = Readonly<{
  role: C2mCellLayerName;
  tileName: string;
  label: string;
}>;

export type HoverCellSummary = Readonly<{
  index: number;
  point: GridPoint;
  layers: ReadonlyArray<HoverCellLayerSummary>;
}>;

export type BoardEditorStatusSnapshot = Readonly<{
  boardZoom: number;
  boardPan: Readonly<{ x: number; y: number }>;
  hoverPoint: GridPoint | null;
  hoverCellSummary: HoverCellSummary | null;
  isPanning: boolean;
}>;

export type BoardEditorStatusStore = Readonly<{
  getSnapshot: () => BoardEditorStatusSnapshot;
  subscribe: (listener: () => void) => () => void;
  update: (partial: Partial<BoardEditorStatusSnapshot>) => void;
  reset: () => void;
}>;

const DEFAULT_SNAPSHOT: BoardEditorStatusSnapshot = {
  boardZoom: 1,
  boardPan: { x: 0, y: 0 },
  hoverPoint: null,
  hoverCellSummary: null,
  isPanning: false,
};

function gridPointsEqual(a: GridPoint | null, b: GridPoint | null): boolean {
  return a?.x === b?.x && a?.y === b?.y;
}

function hoverLayersEqual(
  a: ReadonlyArray<HoverCellLayerSummary>,
  b: ReadonlyArray<HoverCellLayerSummary>,
): boolean {
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index++) {
    if (
      a[index]?.role !== b[index]?.role ||
      a[index]?.tileName !== b[index]?.tileName ||
      a[index]?.label !== b[index]?.label
    ) {
      return false;
    }
  }

  return true;
}

function hoverCellSummariesEqual(a: HoverCellSummary | null, b: HoverCellSummary | null): boolean {
  return (
    a?.index === b?.index &&
    gridPointsEqual(a?.point ?? null, b?.point ?? null) &&
    hoverLayersEqual(a?.layers ?? [], b?.layers ?? [])
  );
}

function snapshotsEqual(a: BoardEditorStatusSnapshot, b: BoardEditorStatusSnapshot): boolean {
  return (
    a.boardZoom === b.boardZoom &&
    a.boardPan.x === b.boardPan.x &&
    a.boardPan.y === b.boardPan.y &&
    a.isPanning === b.isPanning &&
    gridPointsEqual(a.hoverPoint, b.hoverPoint) &&
    hoverCellSummariesEqual(a.hoverCellSummary, b.hoverCellSummary)
  );
}

export function createBoardEditorStatusStore(): BoardEditorStatusStore {
  let snapshot = DEFAULT_SNAPSHOT;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(partial) {
      const nextSnapshot: BoardEditorStatusSnapshot = {
        ...snapshot,
        ...partial,
        boardPan: partial.boardPan ?? snapshot.boardPan,
      };
      if (snapshotsEqual(snapshot, nextSnapshot)) return;
      snapshot = nextSnapshot;
      listeners.forEach((listener) => listener());
    },
    reset() {
      if (snapshotsEqual(snapshot, DEFAULT_SNAPSHOT)) return;
      snapshot = DEFAULT_SNAPSHOT;
      listeners.forEach((listener) => listener());
    },
  };
}

export function buildHoverCellSummary(
  map: MapJson | null,
  hoverPoint: GridPoint | null,
): HoverCellSummary | null {
  if (!map || !hoverPoint) return null;
  if (
    hoverPoint.x < 0 ||
    hoverPoint.y < 0 ||
    hoverPoint.x >= map.width ||
    hoverPoint.y >= map.height
  ) {
    return null;
  }

  const index = pointToIndex(hoverPoint, map);
  const cell = map.tiles[index];
  if (cell === undefined) return null;

  const layers = flattenCellLayers(cell);
  const orderedLayers = [
    ["thinWalls", layers.thinWalls],
    ["noSign", layers.noSign],
    ["mob", layers.mob],
    ["item", layers.item],
    ["terrain", layers.terrain],
  ] as const;

  return {
    index,
    point: hoverPoint,
    layers: orderedLayers
      .filter(
        (
          entry,
        ): entry is readonly [C2mCellLayerName, NonNullable<(typeof orderedLayers)[number][1]>] =>
          entry[1] !== undefined,
      )
      .map(([role, tile]) => ({
        role,
        tileName: tile.tile,
        label: describeTileSpec(tile) ?? tile.tile,
      })),
  };
}
