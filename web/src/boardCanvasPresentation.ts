import type { GridPoint } from "./editor/boardGeometry.js";

export const BOARD_TILE_PIXEL_SIZE = 32;
export const MIN_BOARD_VISIBLE_MARGIN = 96;

type SizedCanvas = {
  width: number;
  height: number;
};

export type BoardPan = Readonly<{
  x: number;
  y: number;
}>;

export type BoardScreenRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type ClientPoint = Readonly<{
  clientX: number;
  clientY: number;
}>;

export type RectLike = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type VisibleBoardCellWindow = Readonly<{
  startColumn: number;
  endColumn: number;
  startRow: number;
  endRow: number;
}>;

export type BoardViewportPresentationOptions = Readonly<{
  boardPixelWidth: number;
  boardPixelHeight: number;
  boardPan: BoardPan;
  boardZoom: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

export type BoardResizeLockedEdge = "N" | "E" | "S" | "W";

export function ensureCanvasSize(canvas: SizedCanvas, width: number, height: number): boolean {
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}

export function resolveBoardScreenRect(options: BoardViewportPresentationOptions): BoardScreenRect {
  const scaledWidth = options.boardPixelWidth * options.boardZoom;
  const scaledHeight = options.boardPixelHeight * options.boardZoom;

  return {
    x: (options.viewportWidth - scaledWidth) / 2 + options.boardPan.x,
    y: (options.viewportHeight - scaledHeight) / 2 + options.boardPan.y,
    width: scaledWidth,
    height: scaledHeight,
  };
}

export function clampBoardPan(
  options: BoardViewportPresentationOptions & {
    minVisibleMargin?: number;
  },
): BoardPan {
  if (
    options.boardPixelWidth <= 0 ||
    options.boardPixelHeight <= 0 ||
    options.viewportWidth <= 0 ||
    options.viewportHeight <= 0 ||
    options.boardZoom <= 0
  ) {
    return options.boardPan;
  }

  const minVisibleMargin = options.minVisibleMargin ?? MIN_BOARD_VISIBLE_MARGIN;
  const centeredX = (options.viewportWidth - options.boardPixelWidth * options.boardZoom) / 2;
  const centeredY = (options.viewportHeight - options.boardPixelHeight * options.boardZoom) / 2;
  const scaledWidth = options.boardPixelWidth * options.boardZoom;
  const scaledHeight = options.boardPixelHeight * options.boardZoom;

  const minPanX = minVisibleMargin - centeredX - scaledWidth;
  const maxPanX = options.viewportWidth - minVisibleMargin - centeredX;
  const minPanY = minVisibleMargin - centeredY - scaledHeight;
  const maxPanY = options.viewportHeight - minVisibleMargin - centeredY;

  return {
    x: Math.min(maxPanX, Math.max(minPanX, options.boardPan.x)),
    y: Math.min(maxPanY, Math.max(minPanY, options.boardPan.y)),
  };
}

export function resolveBoardPanAfterEdgeResize(
  options: Readonly<{
    edge: BoardResizeLockedEdge;
    previousBoardPixelWidth: number;
    previousBoardPixelHeight: number;
    nextBoardPixelWidth: number;
    nextBoardPixelHeight: number;
    boardPan: BoardPan;
    boardZoom: number;
    viewportWidth: number;
    viewportHeight: number;
  }>,
): BoardPan {
  const widthDelta =
    (options.nextBoardPixelWidth - options.previousBoardPixelWidth) * options.boardZoom;
  const heightDelta =
    (options.nextBoardPixelHeight - options.previousBoardPixelHeight) * options.boardZoom;

  const nextPan =
    options.edge === "W"
      ? {
          x: options.boardPan.x + widthDelta / 2,
          y: options.boardPan.y,
        }
      : options.edge === "E"
        ? {
            x: options.boardPan.x - widthDelta / 2,
            y: options.boardPan.y,
          }
        : options.edge === "N"
          ? {
              x: options.boardPan.x,
              y: options.boardPan.y + heightDelta / 2,
            }
          : {
              x: options.boardPan.x,
              y: options.boardPan.y - heightDelta / 2,
            };

  return clampBoardPan({
    boardPixelWidth: options.nextBoardPixelWidth,
    boardPixelHeight: options.nextBoardPixelHeight,
    boardPan: nextPan,
    boardZoom: options.boardZoom,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
  });
}

function clampCellCoordinate(value: number, maxInclusive: number): number {
  return Math.min(maxInclusive, Math.max(0, value));
}

export function resolveVisibleBoardCellWindow(
  boardRect: BoardScreenRect,
  mapSize: Readonly<{ width: number; height: number }>,
  viewportWidth: number,
  viewportHeight: number,
  overscanCells = 0,
): VisibleBoardCellWindow | null {
  if (
    mapSize.width <= 0 ||
    mapSize.height <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    boardRect.width <= 0 ||
    boardRect.height <= 0
  ) {
    return null;
  }

  const visibleLeft = Math.max(0, boardRect.x);
  const visibleTop = Math.max(0, boardRect.y);
  const visibleRight = Math.min(viewportWidth, boardRect.x + boardRect.width);
  const visibleBottom = Math.min(viewportHeight, boardRect.y + boardRect.height);

  if (visibleLeft >= visibleRight || visibleTop >= visibleBottom) return null;

  const cellScreenWidth = boardRect.width / mapSize.width;
  const cellScreenHeight = boardRect.height / mapSize.height;

  return {
    startColumn: clampCellCoordinate(
      Math.floor((visibleLeft - boardRect.x) / cellScreenWidth) - overscanCells,
      mapSize.width - 1,
    ),
    endColumn: clampCellCoordinate(
      Math.ceil((visibleRight - boardRect.x) / cellScreenWidth) - 1 + overscanCells,
      mapSize.width - 1,
    ),
    startRow: clampCellCoordinate(
      Math.floor((visibleTop - boardRect.y) / cellScreenHeight) - overscanCells,
      mapSize.height - 1,
    ),
    endRow: clampCellCoordinate(
      Math.ceil((visibleBottom - boardRect.y) / cellScreenHeight) - 1 + overscanCells,
      mapSize.height - 1,
    ),
  };
}

export function enumerateVisibleBoardCellWindow(
  window: VisibleBoardCellWindow,
  mapWidth: number,
): number[] {
  const indices: number[] = [];
  for (let row = window.startRow; row <= window.endRow; row++) {
    for (let column = window.startColumn; column <= window.endColumn; column++) {
      indices.push(row * mapWidth + column);
    }
  }
  return indices;
}

export function isIndexVisibleInBoardCellWindow(
  index: number,
  mapWidth: number,
  window: VisibleBoardCellWindow,
): boolean {
  const column = index % mapWidth;
  const row = Math.floor(index / mapWidth);
  return (
    column >= window.startColumn &&
    column <= window.endColumn &&
    row >= window.startRow &&
    row <= window.endRow
  );
}

export function viewportClientPointToBoardPoint(
  rect: RectLike,
  point: ClientPoint,
  boardRect: BoardScreenRect,
  boardPixelWidth: number,
  boardPixelHeight: number,
): Readonly<{ x: number; y: number }> | null {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    boardRect.width <= 0 ||
    boardRect.height <= 0 ||
    boardPixelWidth <= 0 ||
    boardPixelHeight <= 0
  ) {
    return null;
  }

  const localX = point.clientX - rect.left - boardRect.x;
  const localY = point.clientY - rect.top - boardRect.y;

  if (localX < 0 || localY < 0 || localX >= boardRect.width || localY >= boardRect.height) {
    return null;
  }

  return {
    x: (localX / boardRect.width) * boardPixelWidth,
    y: (localY / boardRect.height) * boardPixelHeight,
  };
}

export function boardPointToCell(
  point: Readonly<{ x: number; y: number }> | null,
  mapSize: Readonly<{ width: number; height: number }>,
): GridPoint | null {
  if (!point || mapSize.width <= 0 || mapSize.height <= 0) return null;

  const x = Math.floor(point.x / BOARD_TILE_PIXEL_SIZE);
  const y = Math.floor(point.y / BOARD_TILE_PIXEL_SIZE);

  if (x < 0 || y < 0 || x >= mapSize.width || y >= mapSize.height) return null;
  return { x, y };
}

export function resolveBoardCellScreenRect(
  point: GridPoint,
  mapSize: Readonly<{ width: number; height: number }>,
  boardRect: BoardScreenRect,
): BoardScreenRect {
  const cellWidth = boardRect.width / mapSize.width;
  const cellHeight = boardRect.height / mapSize.height;

  return {
    x: boardRect.x + point.x * cellWidth,
    y: boardRect.y + point.y * cellHeight,
    width: cellWidth,
    height: cellHeight,
  };
}
