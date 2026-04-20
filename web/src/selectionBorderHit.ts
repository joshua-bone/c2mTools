import type { GridPoint } from "./editor/boardGeometry.js";

const BORDER_STROKE_THRESHOLD = 0.14;

export function isSelectionBorderStrokeHit(
  selectedIndices: ReadonlyArray<number>,
  point: GridPoint | null,
  cursorCellPoint: Readonly<{ x: number; y: number }> | null,
  boardSize: Readonly<{ width: number; height: number }>,
): boolean {
  if (!point || !cursorCellPoint || boardSize.width <= 0 || boardSize.height <= 0) return false;

  const localX = cursorCellPoint.x - point.x;
  const localY = cursorCellPoint.y - point.y;
  if (localX < 0 || localY < 0 || localX >= 1 || localY >= 1) return false;

  const index = point.y * boardSize.width + point.x;
  const selectedSet = new Set(selectedIndices);
  if (!selectedSet.has(index)) return false;

  const leftNeighbor = point.x > 0 ? index - 1 : null;
  const rightNeighbor = point.x < boardSize.width - 1 ? index + 1 : null;
  const topNeighbor = point.y > 0 ? index - boardSize.width : null;
  const bottomNeighbor = point.y < boardSize.height - 1 ? index + boardSize.width : null;

  return (
    ((leftNeighbor === null || !selectedSet.has(leftNeighbor)) &&
      localX <= BORDER_STROKE_THRESHOLD) ||
    ((rightNeighbor === null || !selectedSet.has(rightNeighbor)) &&
      localX >= 1 - BORDER_STROKE_THRESHOLD) ||
    ((topNeighbor === null || !selectedSet.has(topNeighbor)) &&
      localY <= BORDER_STROKE_THRESHOLD) ||
    ((bottomNeighbor === null || !selectedSet.has(bottomNeighbor)) &&
      localY >= 1 - BORDER_STROKE_THRESHOLD)
  );
}
