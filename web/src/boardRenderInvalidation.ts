import type { MapJson, TileSpecJson } from "../../src/c2m/mapCodec.js";

export type BoardMapRedrawPlan =
  | Readonly<{
      kind: "full";
    }>
  | Readonly<{
      kind: "partial";
      indices: ReadonlyArray<number>;
    }>;

function tilesEqual(a: TileSpecJson | undefined, b: TileSpecJson | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function resolveChangedMapCellIndices(
  previousMap: MapJson | null,
  nextMap: MapJson | null,
): number[] {
  if (!previousMap && !nextMap) return [];
  if (!previousMap) return nextMap ? nextMap.tiles.map((_, index) => index) : [];
  if (!nextMap) return previousMap.tiles.map((_, index) => index);

  if (previousMap.width !== nextMap.width || previousMap.height !== nextMap.height) {
    return nextMap.tiles.map((_, index) => index);
  }

  const changed: number[] = [];
  for (let index = 0; index < nextMap.tiles.length; index += 1) {
    if (!tilesEqual(previousMap.tiles[index], nextMap.tiles[index])) {
      changed.push(index);
    }
  }

  return changed;
}

export function resolveBoardMapRedrawPlan(
  previousMap: MapJson | null,
  nextMap: MapJson | null,
  options: Readonly<{
    canReuseCanvas: boolean;
    partialThreshold: number;
  }>,
): BoardMapRedrawPlan {
  if (!nextMap || !options.canReuseCanvas) {
    return { kind: "full" };
  }

  if (!previousMap) {
    return { kind: "full" };
  }

  const changed = resolveChangedMapCellIndices(previousMap, nextMap);
  if (changed.length > options.partialThreshold) {
    return { kind: "full" };
  }

  return {
    kind: "partial",
    indices: changed,
  };
}
