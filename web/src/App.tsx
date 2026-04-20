import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BrowseWallsDialog,
  parsePersistedGeneratedLayoutRecordList,
  serializePersistedGeneratedLayoutRecordList,
  GenerateWallsDialog,
  type GenerateWallsDialogProps,
  type WallsBrowserLoadState,
} from "dattools/walls-react";
import type { WallsBankRecord } from "dattools/walls-core";

import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  stringifyC2mJsonV1,
} from "../../src/c2m/c2mJsonV1";
import {
  createSingleLevelset,
  getSelectedLevelEntry,
  replaceLevelsetEntryDoc,
  type C2mLevelsetJsonV1,
} from "../../src/c2g/c2gLevelsetJsonV1";
import { serializeC2gText } from "../../src/c2g/c2gText";
import {
  transformLevelJson,
  transformTileSpec,
  type LevelTransformKind,
} from "../../src/c2m/levelTransform";
import type { C2mJsonV1 } from "../../src/c2m/c2mJsonV1";
import type {
  Dir,
  MapJson,
  ModifierJson,
  TileSpecJson,
  TileSpecObjJson,
  TrackPiece,
} from "../../src/c2m/mapCodec";
import type { CC2Tileset } from "../../src/c2m/render/cc2Tileset";
import {
  BOARD_TILE_PIXEL_SIZE,
  clampBoardPan,
  resolveBoardPanAfterEdgeResize,
  resolveBoardCellScreenRect,
  resolveBoardScreenRect,
  viewportClientPointToBoardPoint,
  boardPointToCell,
  type BoardScreenRect,
} from "./boardCanvasPresentation";
import {
  clampMirrorState,
  createDefaultMirrorState,
  getActiveMirrors,
  resolveMirrorDragOffset,
  resolveMirrorHandleAnchor,
  resolveMirrorLineSegment,
  resolveMirroredHoverPoints,
  resolveMirroredIndexGroups,
  setMirrorOffset,
  toggleMirrorActive,
  type MirrorKind,
  type MirrorTransformKind,
  type MirrorState,
} from "./boardMirrors";
import {
  buildHoverCellSummary,
  createBoardEditorStatusStore,
  type HoverCellSummary,
} from "./boardEditorStatus";
import { getSharedCc2CanvasCellCache } from "./cc2CanvasCache";
import { drawRgbaImageToContext } from "./canvasDrawing";
import { drawCc2CellsToContext, drawCc2MapToCanvas } from "./canvasMapRenderer";
import { resolveBoardMapRedrawPlan, resolveChangedMapCellIndices } from "./boardRenderInvalidation";
import { TilePreview } from "./TilePreview";
import { MAX_C2M_MAP_SIZE, MIN_C2M_MAP_SIZE, createEmptyC2mDoc } from "./editor/createEmptyC2mDoc";
import {
  CARDINAL_DIRS,
  CUSTOM_STYLE_VALUES,
  LOGIC_GATES,
  TRACK_ACTIVE_VALUES,
  TRACK_PIECES,
  getTileModifier,
  layerHasEditableProperties,
  resolveInspectableCell,
  setTileModifier,
  tileSupportsDirection,
  tileSupportsDirectionalArrows,
  tileSupportsModifierKind,
  tileSupportsThinWallCanopy,
  updateCellLayerAtPoint,
} from "./editor/cellInspector";
import {
  clampPoint,
  getLineIndices,
  indexToPoint,
  normalizeRect,
  pointToIndex,
  rectToIndices,
  type GridPoint,
  type GridRect,
} from "./editor/boardGeometry";
import { isSelectionBorderStrokeHit } from "./selectionBorderHit";
import {
  commitHistoryEvent,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
  type C2mEditorHistory,
} from "./editor/editorHistory";
import {
  DEFAULT_C2M_FILE_NAME,
  normalizeC2mFileName,
  normalizeJsonFileName,
} from "./editor/fileName";
import {
  canPlaceWireOnCell,
  clearMapToFloor,
  connectWirePoints,
  copyMapRegion,
  disconnectWirePoints,
  floodFillMap,
  paintMapCells,
  paintMapLine,
  pasteMapRegion,
  placeWireNode,
  resolveClipboardPreviewRect,
  resolveEyedropperBrushAtPoint,
  resolveFloodFillIndices,
  shiftMapWrap,
  transformC2mClipboard,
  type C2mClipboard,
} from "./editor/levelEditing";
import {
  applyMetadataDraft,
  makeMetadataDraft,
  metadataDraftEquals,
  type C2mMetadataDraft,
} from "./editor/metadataDraft";
import {
  canResizeMapEdge,
  makeMapResizeDraft,
  parseMapResizeDraft,
  resizeDraftEquals,
  resizeMap,
  resizeMapEdge,
  type MapResizeDraft,
  type ResizeEdge,
} from "./editor/mapResize";
import { buildNotccLevelUrl } from "./editor/notcc";
import { createDefaultBrushTileSpec } from "./editor/renderPreview";
import {
  rotateBrushSpec,
  rotateDir,
  tileSpecKey,
  type BrushCycleDirection,
} from "./editor/brushTransforms";
import {
  TOOL_SHORTCUTS,
  isEditableShortcutTarget,
  resolveEditorShortcut,
  type EditorToolMode,
} from "./editor/shortcuts";
import {
  DEFAULT_TEXT_BRUSH_ALIGN,
  DEFAULT_TEXT_BRUSH_FONT_FAMILY,
  DEFAULT_TEXT_BRUSH_FONT_SIZE,
  DEFAULT_TEXT_BRUSH_TEXT,
  buildTextBrushPreviewLayout,
  formatTextBrushFontSizeLabel,
  getTextBrushPreviewCaretRect,
  getTextBrushPreviewFontSize,
  getTextBrushPreviewSelectionRects,
  getTextBrushSizeChoices,
  isTextBrushPixelFont,
  loadTextBrushFont,
  normalizeTextBrushFontSize,
  TEXT_BRUSH_ALIGN_CHOICES,
  TEXT_BRUSH_FONT_CHOICES,
  rasterizeTextBrush,
  type RasterizedTextBrush,
  type TextBrushAlign,
  type TextBrushPreviewRect,
} from "./editor/textBrush";
import { describeTileSpec, formatTileDisplayName, getTileSpecName } from "./editor/tileDisplay";
import { loadCc2Tileset } from "./loadCc2Tileset";
import { getPaletteSections } from "./paletteSections";
import { platform } from "./platform";
import { readLocalDocumentSourceList } from "./platform/browser";
import type { OpenedDocumentSource } from "./platform";
import { loadLevelsetFromOpenedDocumentSource } from "./openDocumentSource";
import {
  APP_PREFERENCES_STORAGE_KEY,
  EDITOR_SESSION_STORAGE_KEY,
  parsePersistedAppPreferences,
  parsePersistedEditorSession,
  serializePersistedAppPreferences,
  serializePersistedEditorSession,
  type AppViewMode,
  type PersistedAppPreferences,
  type PersistedEditorSession,
} from "./persistedAppState";
import { renderRecentLevelThumbnail } from "./recentLevelThumbnail";
import { buildSavedLevelsetArchive } from "./saveLevelset";
import { applyRawC2gTextToLevelset } from "./c2gEditing";
import {
  addLevelAfterSelection,
  deleteLevelAtIndex,
  duplicateLevelAtIndex,
  moveLevelToIndex,
  resequenceGeneratedLevelEntries,
} from "./levelsetEditing";
import {
  RECENT_SETS_STORAGE_KEY,
  createPersistedRecentSetEntry,
  createRecentSetId,
  decodePersistedRecentSetEntry,
  findMatchingRecentSetId,
  parsePersistedRecentSets,
  removeRecentSetEntry,
  serializePersistedRecentSets,
  upsertRecentSetEntry,
  type PersistedRecentSetEntry,
} from "./recentSetStorage";
import { applyBankWallMask32ToC2mMap, applyGeneratedWallGridToC2mMap } from "./wallsC2m";
import { loadWallsBank } from "./wallsBank";

const TILESET_URL = `${import.meta.env.BASE_URL}cc2/spritesheet.png`;
const DOCUMENT_PERSIST_DEBOUNCE_MS = 300;
const MIN_BOARD_ZOOM = 0.35;
const MAX_BOARD_ZOOM = 6;
const ZOOM_STEP = 1.15;
const KEYBOARD_PAN_SPEED = 520;
const MAX_PARTIAL_REDRAW_CELLS = 1024;
const PARTIAL_REDRAW_RATIO = 0.2;
const DEFAULT_LEFT_PANEL_WIDTH = 236;
const DEFAULT_RIGHT_PANEL_WIDTH = 320;
const MIN_LEFT_PANEL_WIDTH = 180;
const MAX_LEFT_PANEL_WIDTH = 420;
const MIN_RIGHT_PANEL_WIDTH = 220;
const MAX_RIGHT_PANEL_WIDTH = 520;
const MIN_BOARD_COLUMN_WIDTH = 360;
const SPLITTER_WIDTH = 10;
const C2M_WALLS_STARRED_STORAGE_KEY = "c2mtools:walls-bank-starred";
const C2M_WALLS_HIDDEN_STORAGE_KEY = "c2mtools:walls-bank-hidden";
const C2M_GENERATED_WALLS_STARRED_STORAGE_KEY = "c2mtools:generate-starred";
const ERASER_BRUSH: TileSpecJson = "FLOOR";
const SELECTION_MODE_ORDER: ReadonlyArray<SelectionMode> = ["rect", "contiguous", "tile"];
const DEFAULT_SELECTION_MODE: SelectionMode = "rect";
const EYEDROPPER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g transform='rotate(45 12 12)'><rect x='10' y='2.5' width='4' height='11' rx='1.4' fill='%23f6fbff' stroke='%23121a1f' stroke-width='1.6'/><path d='M10 5.5H8.4A1.4 1.4 0 0 0 7 6.9v3.7A1.4 1.4 0 0 0 8.4 12H10' fill='none' stroke='%23121a1f' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M14 13v6' fill='none' stroke='%23121a1f' stroke-width='1.6' stroke-linecap='round'/><path d='M10.3 19.3h7.4' fill='none' stroke='%23121a1f' stroke-width='1.6' stroke-linecap='round'/><circle cx='14' cy='21' r='1.5' fill='%23235f7a'/></g></svg>\") 4 20, crosshair";

function cycleSelectionMode(current: SelectionMode): SelectionMode {
  const currentIndex = SELECTION_MODE_ORDER.indexOf(current);
  return SELECTION_MODE_ORDER[(currentIndex + 1) % SELECTION_MODE_ORDER.length]!;
}

function getSelectionModeBadge(mode: SelectionMode): "R" | "C" | "A" {
  switch (mode) {
    case "rect":
      return "R";
    case "contiguous":
      return "C";
    case "tile":
      return "A";
  }
}

function getSelectionModeLabel(mode: SelectionMode): string {
  switch (mode) {
    case "rect":
      return "Select Rectangle";
    case "contiguous":
      return "Select Contiguous";
    case "tile":
      return "Select All Tile";
  }
}

function resolveSelectionOperationFromModifierKeys(
  shiftPressed: boolean,
  altPressed: boolean,
): SelectionOperation {
  if (altPressed) return "subtract";
  if (shiftPressed) return "add";
  return "replace";
}

function getSelectionOperationBadge(operation: SelectionOperation): "" | "+" | "-" {
  switch (operation) {
    case "replace":
      return "";
    case "add":
      return "+";
    case "subtract":
      return "-";
  }
}

function buildSelectionCursor(mode: SelectionMode, operation: SelectionOperation): string {
  const modeBadge = getSelectionModeBadge(mode);
  const operationBadge = getSelectionOperationBadge(operation);
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="rgba(248,252,255,0.98)" stroke="rgba(28,42,51,0.96)" stroke-width="1.3" d="M5.5 3.5v18.9l4.48-4.22 2.87 7.43 3.17-1.24-2.88-7.43 6.38-.1z"/><rect x="16.5" y="18.5" width="11" height="9" rx="3" fill="rgba(20,33,42,0.94)"/><text x="22" y="24.3" text-anchor="middle" font-family="Avenir Next, Segoe UI, sans-serif" font-size="7.8" font-weight="700" fill="rgba(248,252,255,0.98)">${modeBadge}</text>${operationBadge ? `<circle cx="27.2" cy="19.4" r="3.3" fill="rgba(129, 215, 255, 0.98)"/><text x="27.2" y="21.8" text-anchor="middle" font-family="Avenir Next, Segoe UI, sans-serif" font-size="6.7" font-weight="800" fill="rgba(20,33,42,0.98)">${operationBadge}</text>` : ""}</svg>`,
  )}") 2 2, crosshair`;
}

function buildSelectionMoveCursor(): string {
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><path d="M18 2l-3.6 4.4h2.5v6.1h2.2V6.4h2.5zM34 18l-4.4-3.6v2.5h-6.1v2.2h6.1v2.5zM18 34l3.6-4.4h-2.5v-6.1h-2.2v6.1h-2.5zM2 18l4.4 3.6v-2.5h6.1v-2.2H6.4v-2.5z" fill="rgba(18,26,31,0.96)"/><rect x="8" y="13.2" width="20" height="9.6" rx="4.2" fill="rgba(20,33,42,0.94)"/><text x="18" y="19.8" text-anchor="middle" font-family="Avenir Next, Segoe UI, sans-serif" font-size="6.3" font-weight="800" fill="rgba(248,252,255,0.98)">MOVE</text></svg>`,
  )}") 18 18, move`;
}

function uniqueSortedIndices(indices: ReadonlyArray<number>): number[] {
  return [...new Set(indices)].sort((a, b) => a - b);
}

function resolveSelectionIndices(selection: SelectionArea | null, map: MapJson | null): number[] {
  if (!selection || !map) return [];
  return selection.indices ? [...selection.indices] : rectToIndices(selection, map);
}

function buildSelectionFromIndices(
  indices: ReadonlyArray<number>,
  map: MapJson,
  mode: SelectionMode,
): SelectionArea | null {
  const normalized = uniqueSortedIndices(indices);
  if (normalized.length === 0) return null;

  let minX = map.width - 1;
  let maxX = 0;
  let minY = map.height - 1;
  let maxY = 0;

  for (const index of normalized) {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const rectIndices = rectToIndices(bounds, map);
  const isRectangular =
    normalized.length === rectIndices.length &&
    normalized.every((index, entryIndex) => rectIndices[entryIndex] === index);

  return isRectangular ? { ...bounds, mode } : { ...bounds, indices: normalized, mode };
}

function createSelectionFromRect(rect: GridRect): SelectionArea {
  return {
    ...rect,
    mode: "rect",
  };
}

function applySelectionOperation(
  current: SelectionArea | null,
  nextIndices: ReadonlyArray<number>,
  map: MapJson,
  operation: SelectionOperation,
  mode: SelectionMode,
): SelectionArea | null {
  if (operation === "replace") return buildSelectionFromIndices(nextIndices, map, mode);

  const nextSet = new Set(uniqueSortedIndices(nextIndices));
  const merged = resolveSelectionIndices(current, map).filter((index) =>
    operation === "subtract" ? !nextSet.has(index) : true,
  );

  if (operation === "add") merged.push(...nextSet);
  return buildSelectionFromIndices(merged, map, mode);
}

function tileSelectionKey(tile: TileSpecJson | undefined): string {
  return JSON.stringify(tile ?? null);
}

function resolveContiguousTileSelection(map: MapJson, origin: GridPoint): number[] {
  const startIndex = pointToIndex(origin, map);
  const startKey = tileSelectionKey(map.tiles[startIndex]);
  const visited = new Set<number>();
  const queue = [startIndex];
  const matches: number[] = [];

  while (queue.length > 0) {
    const index = queue.shift()!;
    if (visited.has(index)) continue;
    visited.add(index);
    if (tileSelectionKey(map.tiles[index]) !== startKey) continue;
    matches.push(index);

    const point = indexToPoint(index, map);
    if (point.x > 0) queue.push(index - 1);
    if (point.x < map.width - 1) queue.push(index + 1);
    if (point.y > 0) queue.push(index - map.width);
    if (point.y < map.height - 1) queue.push(index + map.width);
  }

  return matches;
}

function resolveTileMatchSelection(map: MapJson, origin: GridPoint): number[] {
  const startIndex = pointToIndex(origin, map);
  const startKey = tileSelectionKey(map.tiles[startIndex]);
  const matches: number[] = [];

  for (let index = 0; index < map.tiles.length; index += 1) {
    if (tileSelectionKey(map.tiles[index]) === startKey) matches.push(index);
  }

  return matches;
}

function buildC2mPastePreviewSelection(
  map: MapJson,
  anchor: GridPoint,
  clipboard: C2mClipboard,
): SelectionArea | null {
  const indices: number[] = [];

  for (let y = 0; y < clipboard.height; y += 1) {
    for (let x = 0; x < clipboard.width; x += 1) {
      const absoluteX = anchor.x + x;
      const absoluteY = anchor.y + y;
      if (absoluteX < 0 || absoluteY < 0 || absoluteX >= map.width || absoluteY >= map.height) {
        continue;
      }
      const relativeIndex = y * clipboard.width + x;
      if (clipboard.mask && !clipboard.mask[relativeIndex]) continue;
      indices.push(pointToIndex({ x: absoluteX, y: absoluteY }, map));
    }
  }

  return buildSelectionFromIndices(indices, map, "rect");
}

function isSelectionBorderPoint(
  selection: SelectionArea | null,
  point: GridPoint | null,
  cursorPoint: Readonly<{ x: number; y: number }> | null,
  map: MapJson | null,
): boolean {
  return isSelectionBorderStrokeHit(
    map ? resolveSelectionIndices(selection, map) : [],
    point,
    cursorPoint,
    {
      width: map?.width ?? 0,
      height: map?.height ?? 0,
    },
  );
}

function buildMovedSelection(
  map: MapJson,
  anchor: GridPoint,
  clipboard: C2mClipboard,
  mode: SelectionMode,
): SelectionArea | null {
  const movedSelection = buildC2mPastePreviewSelection(map, anchor, clipboard);
  return movedSelection ? { ...movedSelection, mode } : null;
}

function createSelectionPreviewState(
  map: MapJson,
  selection: SelectionArea,
): SelectionPreviewState {
  const selectionIndices = resolveSelectionIndices(selection, map);
  return {
    baseMap: paintMapCells(map, selectionIndices, ERASER_BRUSH),
    clipboard: copyMapRegion(map, selection, selectionIndices),
    selectionMode: selection.mode,
    anchor: { x: selection.x, y: selection.y },
  };
}

function resolveTextBrushPlacementIndices(
  raster: RasterizedTextBrush | null,
  center: GridPoint | null,
  map: MapJson | null,
): number[] {
  if (!raster || !center || !map) return [];

  const originX = center.x - Math.floor(raster.width / 2);
  const originY = center.y - Math.floor(raster.height / 2);
  const indices: number[] = [];

  for (const relativeIndex of raster.indices) {
    const x = originX + (relativeIndex % raster.width);
    const y = originY + Math.floor(relativeIndex / raster.width);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    indices.push(pointToIndex({ x, y }, map));
  }

  return uniqueSortedIndices(indices);
}

function flattenMirroredIndices(
  groups: Readonly<Record<MirrorTransformKind | "SELF", ReadonlyArray<number>>>,
): number[] {
  return uniqueSortedIndices([
    ...groups.SELF,
    ...groups.FLIP_H,
    ...groups.FLIP_V,
    ...groups.FLIP_DIAG_NWSE,
    ...groups.FLIP_DIAG_NESW,
    ...groups.ROTATE_180,
  ]);
}

const TRANSFORMS: Array<{ label: string; op: LevelTransformKind }> = [
  { label: "Rot 90", op: "ROTATE_90" },
  { label: "Rot 180", op: "ROTATE_180" },
  { label: "Rot 270", op: "ROTATE_270" },
  { label: "Flip H", op: "FLIP_H" },
  { label: "Flip V", op: "FLIP_V" },
  { label: "Flip NW/SE", op: "FLIP_DIAG_NWSE" },
  { label: "Flip NE/SW", op: "FLIP_DIAG_NESW" },
];

const LEVEL_EDGE_CONTROLS = [
  {
    direction: "north",
    dx: 0,
    dy: -1,
    edge: "N",
    wrapLabel: "Shift map north",
    growLabel: "Add row at the north edge",
    shrinkLabel: "Remove row from the north edge",
  },
  {
    direction: "south",
    dx: 0,
    dy: 1,
    edge: "S",
    wrapLabel: "Shift map south",
    growLabel: "Add row at the south edge",
    shrinkLabel: "Remove row from the south edge",
  },
  {
    direction: "west",
    dx: -1,
    dy: 0,
    edge: "W",
    wrapLabel: "Shift map west",
    growLabel: "Add column at the west edge",
    shrinkLabel: "Remove column from the west edge",
  },
  {
    direction: "east",
    dx: 1,
    dy: 0,
    edge: "E",
    wrapLabel: "Shift map east",
    growLabel: "Add column at the east edge",
    shrinkLabel: "Remove column from the east edge",
  },
] as const;

const BOARD_TRANSFORM_BUTTONS: ReadonlyArray<
  Readonly<{
    op: LevelTransformKind;
    position: "corner-nw" | "corner-ne" | "top-center" | "left-center" | "corner-sw" | "corner-se";
    label: string;
  }>
> = [
  { op: "ROTATE_270", position: "corner-nw", label: "Rotate 270 degrees" },
  { op: "ROTATE_90", position: "corner-ne", label: "Rotate 90 degrees" },
  { op: "FLIP_H", position: "top-center", label: "Flip horizontally" },
  { op: "FLIP_V", position: "left-center", label: "Flip vertically" },
  { op: "FLIP_DIAG_NESW", position: "corner-sw", label: "Flip along the NE-SW diagonal" },
  { op: "FLIP_DIAG_NWSE", position: "corner-se", label: "Flip along the NW-SE diagonal" },
] as const;

const BOARD_MIRROR_BUTTONS: ReadonlyArray<
  Readonly<{
    kind: MirrorKind;
    label: string;
  }>
> = [
  { kind: "horizontal", label: "Toggle horizontal mirror" },
  { kind: "diag-desc", label: "Toggle descending diagonal mirror" },
  { kind: "vertical", label: "Toggle vertical mirror" },
  { kind: "diag-asc", label: "Toggle ascending diagonal mirror" },
] as const;

const LAYER_LABELS = {
  terrain: "Terrain",
  item: "Item",
  mob: "Mob",
  noSign: "Marker",
  thinWalls: "Thin Walls",
} as const;

type SelectChoice = Readonly<{
  value: string;
  label: string;
}>;

const FILE_VERSION_CHOICES: ReadonlyArray<SelectChoice> = Object.freeze([
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "7", label: "7 (latest)" },
]);

const EDITOR_WINDOW_CHOICES: ReadonlyArray<SelectChoice> = Object.freeze([
  { value: "0", label: "10x10 view" },
  { value: "1", label: "9x9 view" },
  { value: "2", label: "Split view" },
]);

const BINARY_FLAG_CHOICES: ReadonlyArray<SelectChoice> = Object.freeze([
  { value: "0", label: "Off" },
  { value: "1", label: "On" },
]);

const VERIFIED_REPLAY_CHOICES: ReadonlyArray<SelectChoice> = Object.freeze([
  { value: "0", label: "Not verified" },
  { value: "1", label: "Verified replay works" },
]);

const HIDE_MAP_CHOICES: ReadonlyArray<SelectChoice> = Object.freeze([
  { value: "0", label: "Show map in editor" },
  { value: "1", label: "Hide map in editor" },
]);

const READ_ONLY_OPTION_CHOICES: ReadonlyArray<SelectChoice> = Object.freeze([
  { value: "0", label: "Editable" },
  { value: "1", label: "Read-only" },
]);

const BLOB_PATTERN_CHOICES: ReadonlyArray<SelectChoice> = Object.freeze([
  { value: "0", label: "Deterministic" },
  { value: "1", label: "4 patterns" },
  { value: "2", label: "Extra random" },
]);

type InspectorTab = "palette" | "level" | "inspect";
type LeftPanelTab = "levels" | "controls";
type BoardMenuId = "file" | "view" | "transform" | "ideas";
type PaletteAssignmentTarget = "primary" | "secondary";
type IdeasDialogId = "browse-walls" | "generate-walls";
type GeneratedWallLayoutRecord = Parameters<GenerateWallsDialogProps["onImport"]>[0];

type ToolMode = EditorToolMode;
type SelectionMode = "rect" | "contiguous" | "tile";
type SelectionOperation = "replace" | "add" | "subtract";
type TextBrushConfig = Readonly<{
  text: string;
  fontFamily: string;
  fontSize: number;
  align: TextBrushAlign;
}>;
type SelectionArea = GridRect &
  Readonly<{
    indices?: ReadonlyArray<number>;
    mode: SelectionMode;
  }>;

type InitialAppState = Readonly<{
  history: C2mEditorHistory | null;
  fileName: string | null;
  jsonText: string;
  preferences: PersistedAppPreferences;
  recentSets: ReadonlyArray<PersistedRecentSetEntry>;
  activeRecentSetId: string | null;
}>;

type ViewportSize = Readonly<{
  width: number;
  height: number;
}>;

type LayoutResizeState = Readonly<{
  side: "left" | "right";
  pointerId: number;
  startClientX: number;
  startWidth: number;
}>;

type LevelDropState = Readonly<{
  index: number;
  position: "before" | "after";
}> | null;

type DragPanState = Readonly<{
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originPan: Readonly<{ x: number; y: number }>;
}>;

type MirrorDragState = Readonly<{
  kind: MirrorKind;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}>;

type BrushDragState = Readonly<{
  tool: "brush";
  pointerId: number;
  lastPoint: GridPoint;
  previewMap: MapJson;
  brush: TileSpecJson;
}>;

type LineDragState = Readonly<{
  tool: "line";
  pointerId: number;
  start: GridPoint;
  current: GridPoint;
  brush: TileSpecJson;
}>;

type SelectDragState = Readonly<{
  tool: "select";
  pointerId: number;
  start: GridPoint;
  current: GridPoint;
  mode: SelectionMode;
  operation: SelectionOperation;
}>;

type MoveSelectionDragState = Readonly<{
  tool: "move-selection";
  pointerId: number;
  baseMap: MapJson;
  clipboard: C2mClipboard;
  sourceSelection: SelectionArea;
  sourceIndices: ReadonlyArray<number>;
  selectionMode: SelectionMode;
  originAnchor: GridPoint;
  currentAnchor: GridPoint;
  grabOffset: GridPoint;
}>;

type SelectionPreviewState = Readonly<{
  baseMap: MapJson;
  clipboard: C2mClipboard;
  selectionMode: SelectionMode;
  anchor: GridPoint;
}>;

type SelectionTransformMenuState = Readonly<{
  x: number;
  y: number;
}> | null;

type WireDragState = Readonly<{
  tool: "wire";
  pointerId: number;
  lastPoint: GridPoint;
  baseMap: MapJson;
  previewMap: MapJson;
  mode: "add" | "remove";
}>;

type DragState =
  | BrushDragState
  | LineDragState
  | SelectDragState
  | MoveSelectionDragState
  | WireDragState;

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function clampZoom(value: number): number {
  return Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, Number(value.toFixed(3))));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage removal errors.
  }
}

function parseStoredStringSet(value: string | null): Set<string> {
  if (!value) return new Set();

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

function persistStringSet(key: string, values: ReadonlySet<string>): void {
  if (values.size === 0) {
    removeLocalStorage(key);
    return;
  }

  writeLocalStorage(key, JSON.stringify([...values].sort((a, b) => a.localeCompare(b, "en"))));
}

function formatRecentLevelUpdatedAt(updatedAt: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(updatedAt);
  } catch {
    return new Date(updatedAt).toLocaleString();
  }
}

function isBoardPanGesture(event: Pick<PointerEvent, "button" | "metaKey" | "ctrlKey">): boolean {
  return event.button === 1 || (event.button === 0 && (event.metaKey || event.ctrlKey));
}

function isSupportedBoardToolButton(button: number): button is 0 | 2 {
  return button === 0 || button === 2;
}

function isKeyboardPanKey(key: string): boolean {
  return (
    key === "w" ||
    key === "a" ||
    key === "s" ||
    key === "d" ||
    key === "arrowup" ||
    key === "arrowdown" ||
    key === "arrowleft" ||
    key === "arrowright"
  );
}

function ensureChoiceValue(
  choices: ReadonlyArray<SelectChoice>,
  currentValue: string,
  customLabelPrefix: string,
): ReadonlyArray<SelectChoice> {
  if (currentValue.length === 0 || choices.some((choice) => choice.value === currentValue)) {
    return choices;
  }

  return [...choices, { value: currentValue, label: `${customLabelPrefix}: ${currentValue}` }];
}

function pointWithinMap(
  point: GridPoint | null,
  map: Readonly<Pick<MapJson, "width" | "height">>,
): point is GridPoint {
  return !!point && point.x >= 0 && point.y >= 0 && point.x < map.width && point.y < map.height;
}

function resolveRectScreenRect(
  rect: GridRect,
  map: Pick<MapJson, "width" | "height">,
  boardRect: BoardScreenRect,
): BoardScreenRect {
  const cellWidth = boardRect.width / map.width;
  const cellHeight = boardRect.height / map.height;

  return {
    x: boardRect.x + rect.x * cellWidth,
    y: boardRect.y + rect.y * cellHeight,
    width: rect.width * cellWidth,
    height: rect.height * cellHeight,
  };
}

function toggleOrderedValue<T>(
  values: ReadonlyArray<T>,
  value: T,
  enabled: boolean,
  order: ReadonlyArray<T>,
): T[] {
  const set = new Set(values);
  if (enabled) set.add(value);
  else set.delete(value);
  return order.filter((entry) => set.has(entry));
}

function toTileSpecObj(spec: TileSpecJson): TileSpecObjJson {
  return typeof spec === "string" ? { tile: spec } : spec;
}

function stripLower(tile: TileSpecObjJson): TileSpecObjJson {
  const { lower: _lower, ...rest } = tile;
  return rest;
}

function resolveDefaultInspectorTile(tileName: string): TileSpecObjJson {
  return stripLower(toTileSpecObj(createDefaultBrushTileSpec(tileName)));
}

function resolveDefaultModifier<K extends ModifierJson["kind"]>(
  tileName: string,
  kind: K,
): Extract<ModifierJson, { kind: K }> | null {
  return getTileModifier(resolveDefaultInspectorTile(tileName), kind);
}

function formatDirectionLabel(dir: Dir): string {
  return dir;
}

function formatTrackPieceLabel(piece: TrackPiece): string {
  switch (piece) {
    case "TURN_NE":
      return "Turn NE";
    case "TURN_SE":
      return "Turn SE";
    case "TURN_SW":
      return "Turn SW";
    case "TURN_NW":
      return "Turn NW";
    case "HORIZONTAL":
      return "Horizontal";
    case "VERTICAL":
      return "Vertical";
    case "SWITCH":
      return "Switch";
  }
}

function describeHoverSummary(summary: HoverCellSummary | null): string {
  if (!summary) {
    return "";
  }

  const layerSummary = summary.layers
    .map((layer) => `${LAYER_LABELS[layer.role]}: ${layer.label}`)
    .join(" · ");

  return `${summary.point.x},${summary.point.y} · ${layerSummary}`;
}

function renderRotateTransformIcon(mirrored: boolean) {
  const markerId = mirrored ? "rotate-transform-head-mirrored" : "rotate-transform-head";

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 6 6"
          refX="5.05"
          refY="3"
          markerWidth="6"
          markerHeight="6"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path
            d="M0.9 1 5.1 3 2.9 5.95"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <g transform={mirrored ? "translate(20 0) scale(-1 1)" : undefined}>
        <path
          d="M10 3.25a6.75 6.75 0 1 0 5.74 10.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          markerStart={`url(#${markerId})`}
        />
      </g>
    </svg>
  );
}

function renderBoardTransformIcon(op: LevelTransformKind) {
  switch (op) {
    case "ROTATE_90":
      return renderRotateTransformIcon(true);
    case "ROTATE_270":
      return renderRotateTransformIcon(false);
    case "FLIP_H":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line
            x1="10"
            y1="3"
            x2="10"
            y2="17"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <polyline
            points="3.5 7 7 10 3.5 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="16.5 7 13 10 16.5 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "FLIP_V":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line
            x1="3"
            y1="10"
            x2="17"
            y2="10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <polyline
            points="7 3.5 10 7 13 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="7 16.5 10 13 13 16.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "FLIP_DIAG_NESW":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line
            x1="4"
            y1="16"
            x2="16"
            y2="4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <polyline
            points="4.5 10.5 4.5 4.5 10.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="9.5 15.5 15.5 15.5 15.5 9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "FLIP_DIAG_NWSE":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line
            x1="4"
            y1="4"
            x2="16"
            y2="16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <polyline
            points="9.5 4.5 15.5 4.5 15.5 10.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="4.5 9.5 4.5 15.5 10.5 15.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "ROTATE_180":
      return renderRotateTransformIcon(false);
  }
}

function applyMirroredMapPaint(
  map: MapJson,
  indices: ReadonlyArray<number>,
  brush: TileSpecJson,
  mirrors: MirrorState,
): MapJson {
  const groups = resolveMirroredIndexGroups(indices, mirrors, {
    width: map.width,
    height: map.height,
  });
  let nextMap = map;

  const applyGroup = (
    groupIndices: ReadonlyArray<number>,
    transformKind: LevelTransformKind | null,
  ) => {
    if (groupIndices.length === 0) return;
    const nextBrush = transformKind ? transformTileSpec(brush, transformKind) : brush;
    nextMap = paintMapCells(nextMap, groupIndices, nextBrush);
  };

  applyGroup(groups.SELF, null);
  applyGroup(groups.FLIP_H, "FLIP_H");
  applyGroup(groups.FLIP_V, "FLIP_V");
  applyGroup(groups.FLIP_DIAG_NWSE, "FLIP_DIAG_NWSE");
  applyGroup(groups.FLIP_DIAG_NESW, "FLIP_DIAG_NESW");
  applyGroup(groups.ROTATE_180, "ROTATE_180");

  return nextMap;
}

function applyMirroredMapLine(
  map: MapJson,
  start: GridPoint,
  end: GridPoint,
  brush: TileSpecJson,
  mirrors: MirrorState,
): MapJson {
  return applyMirroredMapPaint(map, getLineIndices(start, end, map), brush, mirrors);
}

function applyMirroredMapFill(
  map: MapJson,
  origin: GridPoint,
  brush: TileSpecJson,
  mirrors: MirrorState,
): MapJson {
  return applyMirroredMapPaint(map, resolveFloodFillIndices(map, origin), brush, mirrors);
}

function resolveMirrorButtonTransform(kind: MirrorKind, edge: "top" | "left" | "right"): string {
  switch (kind) {
    case "vertical":
      return "translate(-50%, calc(-100% - 72px))";
    case "horizontal":
      return "translate(calc(-100% - 54px), -50%) rotate(-90deg)";
    case "diag-desc":
      return edge === "top" || edge === "left"
        ? "translate(calc(-50% - 44px), calc(-50% - 44px)) rotate(-45deg)"
        : "translate(calc(-50% - 44px), calc(-50% - 44px)) rotate(-45deg)";
    case "diag-asc":
      return edge === "top" || edge === "right"
        ? "translate(calc(-50% + 44px), calc(-50% - 44px)) rotate(45deg)"
        : "translate(calc(-50% + 44px), calc(-50% - 44px)) rotate(45deg)";
  }
}

function isValidLetterSymbol(symbol: string): boolean {
  return (
    symbol === "↑" ||
    symbol === "→" ||
    symbol === "↓" ||
    symbol === "←" ||
    (symbol.length === 1 && symbol.charCodeAt(0) >= 0x20 && symbol.charCodeAt(0) <= 0x5f)
  );
}

function resolveVisualEditLockReason(
  options: Readonly<{
    parseError: string | null;
    doc: C2mJsonV1 | null;
    map: MapJson | null;
  }>,
): string | null {
  if (options.parseError) {
    return "Visual editing is read-only while the raw JSON is invalid. Fix the JSON or undo the invalid edit before applying board, metadata, resize, or cell-inspector changes.";
  }

  if (!options.doc) {
    return "Open or create a `.c2m` file to use the visual editor.";
  }

  if (!options.map) {
    return "This document has no decoded map payload. Raw JSON remains available, but board editing is unavailable.";
  }

  return null;
}

function createInitialAppState(): InitialAppState {
  if (typeof window === "undefined") {
    return {
      history: null,
      fileName: null,
      jsonText: "",
      preferences: parsePersistedAppPreferences(null),
      recentSets: [],
      activeRecentSetId: null,
    };
  }

  const preferences = parsePersistedAppPreferences(readLocalStorage(APP_PREFERENCES_STORAGE_KEY));
  const recentSets = parsePersistedRecentSets(readLocalStorage(RECENT_SETS_STORAGE_KEY));
  const session = parsePersistedEditorSession(readLocalStorage(EDITOR_SESSION_STORAGE_KEY));

  if (!session) {
    return {
      history: null,
      fileName: null,
      jsonText: "",
      preferences,
      recentSets,
      activeRecentSetId: null,
    };
  }

  const selectedLevelEntry = getSelectedLevelEntry(session.levelset, session.selectedLevelIndex);
  const selectedDoc = selectedLevelEntry?.doc ?? null;
  const activeRecentSetId = selectedDoc
    ? findMatchingRecentSetId(recentSets, session.levelset, session.fileName)
    : null;

  return {
    history: createEditorHistory(session.levelset, session.selectedLevelIndex),
    fileName: session.fileName,
    jsonText: selectedDoc ? stringifyC2mJsonV1(selectedDoc) : "",
    preferences,
    recentSets,
    activeRecentSetId,
  };
}

export default function App() {
  const boardCanvasRef = useRef<HTMLCanvasElement>(null);
  const boardViewportRef = useRef<HTMLDivElement>(null);
  const editorLayoutRef = useRef<HTMLElement>(null);
  const boardMenuBarRef = useRef<HTMLDivElement>(null);
  const boardMenuWrapRefs = useRef<Partial<Record<BoardMenuId, HTMLDivElement | null>>>({});
  const boardStatusStoreRef = useRef(createBoardEditorStatusStore());
  const dragPanRef = useRef<DragPanState | null>(null);
  const recentCarouselRef = useRef<HTMLDivElement>(null);
  const keyboardPanKeysRef = useRef<Set<string>>(new Set());
  const keyboardPanFrameRef = useRef<number | null>(null);
  const keyboardPanLastTimeRef = useRef<number | null>(null);
  const sessionPersistTimeoutRef = useRef<number | null>(null);
  const recentPersistTimeoutRef = useRef<number | null>(null);
  const lastRenderedMapRef = useRef<MapJson | null>(null);
  const lastRenderedTilesetRef = useRef<CC2Tileset | null>(null);
  const lastWireSpoolOverlayPointRef = useRef<GridPoint | null>(null);
  const wireSpoolOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wireSpoolOverlayTilesetRef = useRef<CC2Tileset | null>(null);
  const [initialAppState] = useState(() => createInitialAppState());
  const initialSelectedLevelEntry = initialAppState.history
    ? getSelectedLevelEntry(initialAppState.history.doc, initialAppState.history.selectedLevelIndex)
    : null;
  const syncedJsonTextRef = useRef(initialAppState.jsonText);
  const recentSetsRef = useRef<ReadonlyArray<PersistedRecentSetEntry>>(initialAppState.recentSets);
  const activeRecentSetIdRef = useRef<string | null>(initialAppState.activeRecentSetId);
  const latestAutosaveTilesetRef = useRef<CC2Tileset | null>(null);
  const latestSessionSnapshotRef = useRef<PersistedEditorSession | null>(
    initialAppState.history && initialAppState.fileName
      ? {
          levelset: initialAppState.history.doc,
          selectedLevelIndex: initialAppState.history.selectedLevelIndex,
          fileName: initialAppState.fileName,
        }
      : null,
  );

  const [viewMode, setViewMode] = useState<AppViewMode>(initialAppState.preferences.viewMode);
  const [history, setHistory] = useState<C2mEditorHistory | null>(initialAppState.history);
  const [fileName, setFileName] = useState<string | null>(initialAppState.fileName);
  const [jsonText, setJsonText] = useState<string>(initialAppState.jsonText);
  const [recentSets, setRecentSets] = useState<ReadonlyArray<PersistedRecentSetEntry>>(
    initialAppState.recentSets,
  );
  const [activeRecentSetId, setActiveRecentSetId] = useState<string | null>(
    initialAppState.activeRecentSetId,
  );
  const [recentModalOpen, setRecentModalOpen] = useState(false);
  const [ideasDialogOpen, setIdeasDialogOpen] = useState<IdeasDialogId | null>(null);
  const [c2gEditorOpen, setC2gEditorOpen] = useState(false);
  const [c2gDraftText, setC2gDraftText] = useState("");
  const [c2gDraftError, setC2gDraftError] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    width: 0,
    height: 0,
  });
  const [primaryBrush, setPrimaryBrush] = useState<TileSpecJson>(() =>
    createDefaultBrushTileSpec("WALL"),
  );
  const [secondaryBrush, setSecondaryBrush] = useState<TileSpecJson>(() =>
    createDefaultBrushTileSpec("FLOOR"),
  );
  const [textBrushText, setTextBrushText] = useState(DEFAULT_TEXT_BRUSH_TEXT);
  const [textBrushFontFamily, setTextBrushFontFamily] = useState(DEFAULT_TEXT_BRUSH_FONT_FAMILY);
  const [textBrushFontSize, setTextBrushFontSize] = useState(DEFAULT_TEXT_BRUSH_FONT_SIZE);
  const [textBrushAlign, setTextBrushAlign] = useState<TextBrushAlign>(DEFAULT_TEXT_BRUSH_ALIGN);
  useEffect(() => {
    const normalizedFontSize = normalizeTextBrushFontSize(textBrushFontFamily, textBrushFontSize);
    if (normalizedFontSize !== textBrushFontSize) {
      setTextBrushFontSize(normalizedFontSize);
    }
  }, [textBrushFontFamily, textBrushFontSize]);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [tool, setTool] = useState<ToolMode>("brush");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(DEFAULT_SELECTION_MODE);
  const [globalDirection, setGlobalDirection] = useState<Dir>("N");
  const [logicCounterValue, setLogicCounterValue] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("palette");
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>("levels");
  const [boardMenuOpen, setBoardMenuOpen] = useState<BoardMenuId | null>(null);
  const [boardMenuDropdownShift, setBoardMenuDropdownShift] = useState(0);
  const [lastPaletteAssignmentTarget, setLastPaletteAssignmentTarget] =
    useState<PaletteAssignmentTarget>("primary");
  const [selection, setSelection] = useState<SelectionArea | null>(null);
  const [selectionPreview, setSelectionPreview] = useState<SelectionPreviewState | null>(null);
  const [selectionTransformMenu, setSelectionTransformMenu] =
    useState<SelectionTransformMenuState>(null);
  const [clipboard, setClipboard] = useState<C2mClipboard | null>(null);
  const [pastePreviewActive, setPastePreviewActive] = useState(false);
  const [layoutResizeState, setLayoutResizeState] = useState<LayoutResizeState | null>(null);
  const [draggedLevelIndex, setDraggedLevelIndex] = useState<number | null>(null);
  const [levelDropState, setLevelDropState] = useState<LevelDropState>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
    clampNumber(
      initialAppState.preferences.leftPanelWidth,
      MIN_LEFT_PANEL_WIDTH,
      MAX_LEFT_PANEL_WIDTH,
    ),
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    clampNumber(
      initialAppState.preferences.rightPanelWidth,
      MIN_RIGHT_PANEL_WIDTH,
      MAX_RIGHT_PANEL_WIDTH,
    ),
  );
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [mirrorState, setMirrorState] = useState<MirrorState>(() =>
    createDefaultMirrorState({
      width: initialSelectedLevelEntry?.doc.map?.width ?? 32,
      height: initialSelectedLevelEntry?.doc.map?.height ?? 32,
    }),
  );
  const [mirrorDragState, setMirrorDragState] = useState<MirrorDragState | null>(null);
  const [pendingWirePoint, setPendingWirePoint] = useState<GridPoint | null>(null);
  const [transientMap, setTransientMap] = useState<MapJson | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<C2mMetadataDraft | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [resizeDraft, setResizeDraft] = useState<MapResizeDraft | null>(null);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const [cellEditError, setCellEditError] = useState<string | null>(null);

  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [tileset, setTileset] = useState<CC2Tileset | null>(null);
  const [tilesetError, setTilesetError] = useState<string | null>(null);
  const [wallsBankRecords, setWallsBankRecords] = useState<ReadonlyArray<WallsBankRecord>>([]);
  const [wallsBankLoadState, setWallsBankLoadState] = useState<WallsBrowserLoadState>("idle");
  const [wallsBankErrorMessage, setWallsBankErrorMessage] = useState<string | null>(null);
  const [wallsStarredKeys, setWallsStarredKeys] = useState<Set<string>>(() =>
    parseStoredStringSet(readLocalStorage(C2M_WALLS_STARRED_STORAGE_KEY)),
  );
  const [wallsHiddenKeys, setWallsHiddenKeys] = useState<Set<string>>(() =>
    parseStoredStringSet(readLocalStorage(C2M_WALLS_HIDDEN_STORAGE_KEY)),
  );
  const [generatedWallStarredRecords, setGeneratedWallStarredRecords] = useState<
    ReadonlyArray<GeneratedWallLayoutRecord>
  >(() =>
    parsePersistedGeneratedLayoutRecordList(
      readLocalStorage(C2M_GENERATED_WALLS_STARRED_STORAGE_KEY),
    ),
  );

  const boardStatus = useSyncExternalStore(
    boardStatusStoreRef.current.subscribe,
    boardStatusStoreRef.current.getSnapshot,
    boardStatusStoreRef.current.getSnapshot,
  );
  const [hoverCursorPoint, setHoverCursorPoint] = useState<Readonly<{
    x: number;
    y: number;
  }> | null>(null);

  const levelset = history?.doc ?? null;
  const selectedLevelIndex = history?.selectedLevelIndex ?? 0;
  const selectedLevelEntry = getSelectedLevelEntry(levelset, selectedLevelIndex);
  const doc = selectedLevelEntry?.doc ?? null;
  const map = doc?.map ?? null;
  const activeMap = transientMap ?? map;
  const boardPixelWidth = activeMap ? activeMap.width * BOARD_TILE_PIXEL_SIZE : 0;
  const boardPixelHeight = activeMap ? activeMap.height * BOARD_TILE_PIXEL_SIZE : 0;
  const mirrorBoardSize = useMemo(
    () => ({
      width: activeMap?.width ?? map?.width ?? 32,
      height: activeMap?.height ?? map?.height ?? 32,
    }),
    [activeMap?.height, activeMap?.width, map?.height, map?.width],
  );
  const generateWallsSizeLimits = useMemo(
    () => ({
      min: MIN_C2M_MAP_SIZE,
      max: MAX_C2M_MAP_SIZE,
      initialWidth: map?.width ?? 32,
      initialHeight: map?.height ?? 32,
    }),
    [map?.height, map?.width],
  );
  const jsonTextPresent = jsonText.trim().length > 0;
  const jsonOk = doc !== null && parseError === null && jsonTextPresent;
  const canMutateBoard = map !== null && jsonOk;
  const canSaveLevel = jsonOk;
  const canSaveSet = levelset !== null && jsonOk;
  const canTestInNotcc = doc !== null && jsonOk;
  const canUndo = history !== null && history.cursor > 0 && jsonOk;
  const canRedo = history !== null && history.cursor < history.events.length && jsonOk;
  const visualEditLockReason = resolveVisualEditLockReason({
    parseError,
    doc,
    map,
  });

  const paletteSections = useMemo(
    () => getPaletteSections({ query: paletteQuery, globalDirection, logicCounterValue }),
    [globalDirection, logicCounterValue, paletteQuery],
  );
  const editorLayoutStyle = useMemo(
    () =>
      ({
        "--left-panel-width": `${leftPanelWidth}px`,
        "--right-panel-width": `${rightPanelWidth}px`,
      }) as CSSProperties,
    [leftPanelWidth, rightPanelWidth],
  );

  const boardRect = useMemo(
    () =>
      activeMap
        ? resolveBoardScreenRect({
            boardPixelWidth,
            boardPixelHeight,
            boardPan: boardStatus.boardPan,
            boardZoom: boardStatus.boardZoom,
            viewportWidth: viewportSize.width,
            viewportHeight: viewportSize.height,
          })
        : null,
    [
      activeMap,
      boardPixelHeight,
      boardPixelWidth,
      boardStatus.boardPan,
      boardStatus.boardZoom,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  useEffect(() => {
    setMirrorState(createDefaultMirrorState(mirrorBoardSize));
  }, [selectedLevelEntry?.id]);

  useEffect(() => {
    setMirrorState((current) => clampMirrorState(current, mirrorBoardSize));
  }, [mirrorBoardSize]);

  const activeMirrors = useMemo(() => getActiveMirrors(mirrorState), [mirrorState]);
  const hasActiveMirrors = activeMirrors.length > 0;

  const hoverCellRects = useMemo(() => {
    if (!activeMap || !boardRect || !boardStatus.hoverPoint) return [];
    return resolveMirroredHoverPoints(boardStatus.hoverPoint, mirrorState, mirrorBoardSize).map(
      (point) => resolveBoardCellScreenRect(point, activeMap, boardRect),
    );
  }, [activeMap, boardRect, boardStatus.hoverPoint, mirrorBoardSize, mirrorState]);
  const selectionOperationPreview = resolveSelectionOperationFromModifierKeys(
    isShiftPressed,
    isAltPressed,
  );
  const selectionMoveHover =
    tool === "select" &&
    canMutateBoard &&
    !pastePreviewActive &&
    !dragState &&
    isSelectionBorderPoint(selection, boardStatus.hoverPoint, hoverCursorPoint, activeMap);
  const boardCanvasCursor = boardStatus.isPanning
    ? "grabbing"
    : dragState?.tool === "move-selection"
      ? buildSelectionMoveCursor()
      : tool === "select"
        ? selectionMoveHover
          ? buildSelectionMoveCursor()
          : buildSelectionCursor(selectionMode, selectionOperationPreview)
        : isAltPressed || tool === "eyedropper"
          ? EYEDROPPER_CURSOR
          : undefined;
  const textBrushConfig = useMemo<TextBrushConfig>(
    () => ({
      text: textBrushText,
      fontFamily: textBrushFontFamily,
      fontSize: textBrushFontSize,
      align: textBrushAlign,
    }),
    [textBrushAlign, textBrushFontFamily, textBrushFontSize, textBrushText],
  );
  const [textBrushFontLoadTick, setTextBrushFontLoadTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void loadTextBrushFont(
      textBrushConfig.fontFamily,
      textBrushConfig.fontSize,
      textBrushConfig.text,
    )
      .then(() => {
        if (!cancelled) {
          setTextBrushFontLoadTick((tick) => tick + 1);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [textBrushConfig.fontFamily, textBrushConfig.fontSize, textBrushConfig.text]);
  const textBrushRaster = useMemo(
    () =>
      rasterizeTextBrush(
        textBrushConfig.text,
        textBrushConfig.fontFamily,
        textBrushConfig.fontSize,
        textBrushConfig.align,
      ),
    [textBrushConfig, textBrushFontLoadTick],
  );
  const textBrushPreviewLayout = useMemo(
    () =>
      buildTextBrushPreviewLayout(
        textBrushConfig.text,
        textBrushConfig.fontFamily,
        textBrushConfig.fontSize,
        textBrushConfig.align,
      ),
    [textBrushConfig, textBrushFontLoadTick],
  );
  const textBrushPreviewRaster = textBrushPreviewLayout?.raster ?? null;
  const [textBrushPreviewScroll, setTextBrushPreviewScroll] = useState({ left: 0, top: 0 });
  const [textBrushSelection, setTextBrushSelection] = useState({
    start: 0,
    end: 0,
    focused: false,
  });
  const textBrushSizeChoices = getTextBrushSizeChoices(textBrushConfig.fontFamily);
  const textBrushPreviewFontSize = getTextBrushPreviewFontSize(
    textBrushConfig.fontFamily,
    textBrushConfig.fontSize,
  );
  const showTextBrushPixelPreview = isTextBrushPixelFont(textBrushConfig.fontFamily);
  useEffect(() => {
    setTextBrushSelection((selection) => {
      const max = textBrushConfig.text.length;
      return {
        ...selection,
        start: Math.min(selection.start, max),
        end: Math.min(selection.end, max),
      };
    });
  }, [textBrushConfig.text]);
  const syncTextBrushSelection = (textarea: HTMLTextAreaElement, focused: boolean): void => {
    setTextBrushSelection({
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
      focused,
    });
  };
  const textBrushSelectionRects = useMemo(
    () =>
      showTextBrushPixelPreview && textBrushPreviewLayout
        ? getTextBrushPreviewSelectionRects(
            textBrushPreviewLayout,
            textBrushSelection.start,
            textBrushSelection.end,
          )
        : ([] as ReadonlyArray<TextBrushPreviewRect>),
    [
      showTextBrushPixelPreview,
      textBrushPreviewLayout,
      textBrushSelection.end,
      textBrushSelection.start,
    ],
  );
  const textBrushCaretRect = useMemo(
    () =>
      showTextBrushPixelPreview &&
      textBrushPreviewLayout &&
      textBrushSelection.focused &&
      textBrushSelection.start === textBrushSelection.end
        ? getTextBrushPreviewCaretRect(textBrushPreviewLayout, textBrushSelection.end)
        : null,
    [
      showTextBrushPixelPreview,
      textBrushPreviewLayout,
      textBrushSelection.end,
      textBrushSelection.focused,
      textBrushSelection.start,
    ],
  );
  const textPreviewBaseIndices = useMemo(
    () =>
      tool === "text" && !dragState
        ? resolveTextBrushPlacementIndices(textBrushRaster, boardStatus.hoverPoint, activeMap)
        : [],
    [activeMap, boardStatus.hoverPoint, dragState, textBrushRaster, tool],
  );
  const textPreviewRect = useMemo(() => {
    if (!activeMap || textPreviewBaseIndices.length === 0) return null;
    const previewIndices = hasActiveMirrors
      ? flattenMirroredIndices(
          resolveMirroredIndexGroups(textPreviewBaseIndices, mirrorState, mirrorBoardSize),
        )
      : textPreviewBaseIndices;
    return buildSelectionFromIndices(previewIndices, activeMap, "rect");
  }, [activeMap, hasActiveMirrors, mirrorBoardSize, mirrorState, textPreviewBaseIndices]);
  const textPreviewMap = useMemo(() => {
    if (!activeMap || tool !== "text" || textPreviewBaseIndices.length === 0) return null;
    return hasActiveMirrors
      ? applyMirroredMapPaint(activeMap, textPreviewBaseIndices, primaryBrush, mirrorState)
      : paintMapCells(activeMap, textPreviewBaseIndices, primaryBrush);
  }, [
    activeMap,
    hasActiveMirrors,
    mirrorBoardSize,
    mirrorState,
    primaryBrush,
    textPreviewBaseIndices,
    tool,
  ]);
  const selectionPreviewMap = useMemo(() => {
    if (!selectionPreview) return null;
    return pasteMapRegion(
      selectionPreview.baseMap,
      selectionPreview.anchor,
      selectionPreview.clipboard,
    );
  }, [selectionPreview]);
  const moveSelectionPreviewMap = useMemo(() => {
    if (!map || dragState?.tool !== "move-selection") return null;
    return pasteMapRegion(dragState.baseMap, dragState.currentAnchor, dragState.clipboard);
  }, [dragState, map]);
  const displayMap =
    transientMap ?? moveSelectionPreviewMap ?? selectionPreviewMap ?? textPreviewMap ?? map;

  const selectionPreviewRect = useMemo(() => {
    if (!activeMap) return null;
    if (dragState?.tool === "move-selection") {
      return buildMovedSelection(
        activeMap,
        dragState.currentAnchor,
        dragState.clipboard,
        dragState.selectionMode,
      );
    }
    if (dragState?.tool === "select") {
      const nextRect = createSelectionFromRect(
        normalizeRect(dragState.start, dragState.current, activeMap),
      );
      return applySelectionOperation(
        selection,
        resolveSelectionIndices(nextRect, activeMap),
        activeMap,
        dragState.operation,
        dragState.mode,
      );
    }
    return selection;
  }, [activeMap, dragState, selection]);

  const linePreviewIndices = useMemo(() => {
    if (!activeMap || dragState?.tool !== "line") return [];
    const groups = resolveMirroredIndexGroups(
      getLineIndices(dragState.start, dragState.current, activeMap),
      mirrorState,
      mirrorBoardSize,
    );
    return [
      ...groups.SELF,
      ...groups.FLIP_H,
      ...groups.FLIP_V,
      ...groups.FLIP_DIAG_NWSE,
      ...groups.FLIP_DIAG_NESW,
      ...groups.ROTATE_180,
    ];
  }, [activeMap, dragState, mirrorBoardSize, mirrorState]);
  const mirrorLineSegments = useMemo(
    () =>
      activeMirrors
        .map((mirror) => resolveMirrorLineSegment(mirror, mirrorBoardSize))
        .filter((segment): segment is NonNullable<typeof segment> => segment !== null),
    [activeMirrors, mirrorBoardSize],
  );

  const pasteAnchor = useMemo(() => {
    if (!activeMap) return null;
    return (
      boardStatus.hoverPoint ?? (selection ? { x: selection.x, y: selection.y } : { x: 0, y: 0 })
    );
  }, [activeMap, boardStatus.hoverPoint, selection]);

  const pastePreviewRect = useMemo(() => {
    if (!activeMap || !clipboard || !pastePreviewActive || !pasteAnchor) return null;
    return buildC2mPastePreviewSelection(activeMap, pasteAnchor, clipboard);
  }, [activeMap, clipboard, pasteAnchor, pastePreviewActive]);

  const transientDirtyCells = useMemo(
    () => resolveChangedMapCellIndices(map, transientMap),
    [map, transientMap],
  );
  const inspectorPoint = useMemo(
    () => (selection ? { x: selection.x, y: selection.y } : boardStatus.hoverPoint),
    [boardStatus.hoverPoint, selection],
  );
  const inspectableCell = useMemo(
    () => resolveInspectableCell(map, inspectorPoint),
    [inspectorPoint, map],
  );
  const editableInspectorLayers = useMemo(
    () => inspectableCell?.layers.filter((layer) => layerHasEditableProperties(layer.tile)) ?? [],
    [inspectableCell],
  );

  const primaryBrushName =
    describeTileSpec(primaryBrush) ?? formatTileDisplayName(getTileSpecName(primaryBrush));
  const secondaryBrushName =
    describeTileSpec(secondaryBrush) ?? formatTileDisplayName(getTileSpecName(secondaryBrush));
  const primaryBrushKey = tileSpecKey(primaryBrush);
  const secondaryBrushKey = tileSpecKey(secondaryBrush);
  const displayedLevelCount = levelset?.levels.length ?? 0;
  const canDeleteSelectedLevel = displayedLevelCount > 1;
  const canMoveDisplayedLevelUp = selectedLevelIndex > 0;
  const canMoveDisplayedLevelDown =
    selectedLevelIndex >= 0 && selectedLevelIndex < displayedLevelCount - 1;
  const activeToolLabel =
    tool === "select"
      ? getSelectionModeLabel(selectionMode)
      : (TOOL_SHORTCUTS.find((entry) => entry.id === tool)?.label ?? tool);
  const preservedSectionTags = doc?.sections?.map((section) => section.tag) ?? [];
  const preservedExtraChunkTags = doc?.extraChunks?.map((section) => section.tag) ?? [];
  const resizeDirty =
    map !== null &&
    resizeDraft !== null &&
    !resizeDraftEquals(resizeDraft, makeMapResizeDraft(map));
  const documentTitle = metadataDraft
    ? metadataDraft.title || "Untitled Level"
    : (doc?.title ?? "Untitled Level");
  const levelsetTitle = levelset?.setName?.trim() || "Untitled Set";
  const hoverSummaryText = describeHoverSummary(boardStatus.hoverCellSummary);
  const displayFileName = fileName ?? DEFAULT_C2M_FILE_NAME;
  const currentWireSpoolOverlayPoint = tool === "wire" ? pendingWirePoint : null;
  const fileVersionChoices = useMemo(
    () =>
      ensureChoiceValue(FILE_VERSION_CHOICES, metadataDraft?.fileVersion ?? "", "Custom version"),
    [metadataDraft?.fileVersion],
  );
  const editorWindowChoices = useMemo(
    () =>
      ensureChoiceValue(
        EDITOR_WINDOW_CHOICES,
        metadataDraft?.editorWindow ?? "",
        "Custom editor window",
      ),
    [metadataDraft?.editorWindow],
  );
  const verifiedReplayChoices = useMemo(
    () =>
      ensureChoiceValue(
        VERIFIED_REPLAY_CHOICES,
        metadataDraft?.verifiedReplay ?? "",
        "Custom verified replay flag",
      ),
    [metadataDraft?.verifiedReplay],
  );
  const hideMapChoices = useMemo(
    () => ensureChoiceValue(HIDE_MAP_CHOICES, metadataDraft?.hideMap ?? "", "Custom hide-map flag"),
    [metadataDraft?.hideMap],
  );
  const readOnlyOptionChoices = useMemo(
    () =>
      ensureChoiceValue(
        READ_ONLY_OPTION_CHOICES,
        metadataDraft?.readOnlyOption ?? "",
        "Custom read-only flag",
      ),
    [metadataDraft?.readOnlyOption],
  );
  const hideLogicChoices = useMemo(
    () =>
      ensureChoiceValue(
        BINARY_FLAG_CHOICES,
        metadataDraft?.hideLogic ?? "",
        "Custom hide-logic flag",
      ),
    [metadataDraft?.hideLogic],
  );
  const cc1BootsChoices = useMemo(
    () =>
      ensureChoiceValue(
        BINARY_FLAG_CHOICES,
        metadataDraft?.cc1Boots ?? "",
        "Custom CC1 boots flag",
      ),
    [metadataDraft?.cc1Boots],
  );
  const blobPatternChoices = useMemo(
    () =>
      ensureChoiceValue(
        BLOB_PATTERN_CHOICES,
        metadataDraft?.blobPatterns ?? "",
        "Custom blob behavior",
      ),
    [metadataDraft?.blobPatterns],
  );

  const clearKeyboardPan = useCallback(() => {
    keyboardPanKeysRef.current.clear();
    if (keyboardPanFrameRef.current !== null) {
      cancelAnimationFrame(keyboardPanFrameRef.current);
      keyboardPanFrameRef.current = null;
    }
    keyboardPanLastTimeRef.current = null;
  }, []);

  const beginBoardPanGesture = useCallback(
    (
      target: Pick<HTMLElement, "setPointerCapture">,
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => {
      target.setPointerCapture(pointerId);
      dragPanRef.current = {
        pointerId,
        startClientX: clientX,
        startClientY: clientY,
        originPan: boardStatusStoreRef.current.getSnapshot().boardPan,
      };
      boardStatusStoreRef.current.update({
        isPanning: true,
        hoverPoint: null,
        hoverCellSummary: null,
      });
    },
    [],
  );

  const resetBoardTransientState = useCallback(
    (options: Readonly<{ clearSelection?: boolean; resetView?: boolean }> = {}) => {
      clearKeyboardPan();
      dragPanRef.current = null;
      setDragState(null);
      setTransientMap(null);
      setPendingWirePoint(null);
      setPastePreviewActive(false);
      setSelectionPreview(null);
      setSelectionTransformMenu(null);
      if (options.clearSelection) setSelection(null);

      if (options.resetView) {
        boardStatusStoreRef.current.reset();
        return;
      }

      boardStatusStoreRef.current.update({
        isPanning: false,
      });
    },
    [clearKeyboardPan],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) setIsAltPressed(true);
      if (event.shiftKey) setIsShiftPressed(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.altKey) setIsAltPressed(false);
      if (!event.shiftKey) setIsShiftPressed(false);
    };
    const onBlur = () => {
      setIsAltPressed(false);
      setIsShiftPressed(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (!pastePreviewActive) return;

    const dismissPastePreview = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const interactiveTarget =
        target instanceof Element
          ? target.closest('button, input, select, textarea, a, [role="button"]')
          : null;

      if (interactiveTarget || !boardViewportRef.current?.contains(target)) {
        setPastePreviewActive(false);
      }
    };

    document.addEventListener("pointerdown", dismissPastePreview, true);
    return () => {
      document.removeEventListener("pointerdown", dismissPastePreview, true);
    };
  }, [pastePreviewActive]);

  useEffect(() => {
    if (!selectionTransformMenu) return;

    const close = () => setSelectionTransformMenu(null);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".selectionTransformContextMenu")) {
        return;
      }
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectionTransformMenu]);

  useEffect(() => {
    if (viewMode !== "board" || !activeMap) {
      clearKeyboardPan();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!isKeyboardPanKey(key)) return;

      event.preventDefault();
      keyboardPanKeysRef.current.add(key);
      if (keyboardPanFrameRef.current !== null) return;

      keyboardPanLastTimeRef.current = null;
      keyboardPanFrameRef.current = requestAnimationFrame(function tick(timestamp) {
        const pressedKeys = keyboardPanKeysRef.current;
        if (pressedKeys.size === 0) {
          keyboardPanFrameRef.current = null;
          keyboardPanLastTimeRef.current = null;
          return;
        }

        const lastTimestamp = keyboardPanLastTimeRef.current ?? timestamp;
        const deltaSeconds = Math.max(0, (timestamp - lastTimestamp) / 1000);
        keyboardPanLastTimeRef.current = timestamp;

        let velocityX = 0;
        let velocityY = 0;

        if (pressedKeys.has("a") || pressedKeys.has("arrowleft")) velocityX += 1;
        if (pressedKeys.has("d") || pressedKeys.has("arrowright")) velocityX -= 1;
        if (pressedKeys.has("w") || pressedKeys.has("arrowup")) velocityY += 1;
        if (pressedKeys.has("s") || pressedKeys.has("arrowdown")) velocityY -= 1;

        const magnitude = Math.hypot(velocityX, velocityY);
        if (magnitude > 0) {
          const distance = KEYBOARD_PAN_SPEED * deltaSeconds;
          const stepX = (velocityX / magnitude) * distance;
          const stepY = (velocityY / magnitude) * distance;
          const snapshot = boardStatusStoreRef.current.getSnapshot();
          boardStatusStoreRef.current.update({
            boardPan: clampBoardPan({
              boardPixelWidth,
              boardPixelHeight,
              boardPan: {
                x: snapshot.boardPan.x + stepX,
                y: snapshot.boardPan.y + stepY,
              },
              boardZoom: snapshot.boardZoom,
              viewportWidth: viewportSize.width,
              viewportHeight: viewportSize.height,
            }),
          });
        }

        keyboardPanFrameRef.current = requestAnimationFrame(tick);
      });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keyboardPanKeysRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener("blur", clearKeyboardPan);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      clearKeyboardPan();
      window.removeEventListener("blur", clearKeyboardPan);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [
    activeMap,
    boardPixelHeight,
    boardPixelWidth,
    clearKeyboardPan,
    viewMode,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (tool !== "wire") {
      setPendingWirePoint(null);
    }
  }, [tool]);

  const applyDocumentChange = useCallback(
    (nextDoc: C2mJsonV1, commitHistory: boolean) => {
      const nextJsonText = stringifyC2mJsonV1(nextDoc);
      syncedJsonTextRef.current = nextJsonText;
      setHistory((current) =>
        current
          ? (() => {
              const nextLevelset = resequenceGeneratedLevelEntries(
                replaceLevelsetEntryDoc(current.doc, current.selectedLevelIndex, nextDoc),
              );
              return commitHistory
                ? commitHistoryEvent(current, {
                    type: "replace-levelset",
                    levelset: nextLevelset,
                  })
                : {
                    ...current,
                    doc: nextLevelset,
                  };
            })()
          : createEditorHistory(
              createSingleLevelset(nextDoc, {
                fileName: fileName ?? DEFAULT_C2M_FILE_NAME,
                source: "generated",
              }),
            ),
      );
      setJsonText(nextJsonText);
      setWarnings([]);
      setError(null);
      setParseError(null);
      setRenderError(null);
    },
    [fileName],
  );

  const commitDocumentChange = useCallback(
    (nextDoc: C2mJsonV1) => {
      applyDocumentChange(nextDoc, true);
    },
    [applyDocumentChange],
  );

  const replaceDocumentChangeLive = useCallback(
    (nextDoc: C2mJsonV1) => {
      applyDocumentChange(nextDoc, false);
    },
    [applyDocumentChange],
  );

  const commitMapChange = useCallback(
    (nextMap: MapJson): boolean => {
      if (!doc?.map || !jsonOk) return false;
      if (nextMap === doc.map) return false;

      commitDocumentChange({
        ...doc,
        map: nextMap,
      });
      return true;
    },
    [commitDocumentChange, doc, jsonOk],
  );

  const replaceMapChangeLive = useCallback(
    (nextMap: MapJson): boolean => {
      if (!doc?.map || !jsonOk) return false;
      if (nextMap === doc.map) return false;

      replaceDocumentChangeLive({
        ...doc,
        map: nextMap,
      });
      return true;
    },
    [doc, jsonOk, replaceDocumentChangeLive],
  );

  const toggleWallsStar = useCallback((wallKey: string) => {
    setWallsStarredKeys((current) => {
      const next = new Set(current);
      if (next.has(wallKey)) next.delete(wallKey);
      else next.add(wallKey);
      return next;
    });
  }, []);

  const toggleWallsHidden = useCallback((wallKey: string) => {
    setWallsHiddenKeys((current) => {
      const next = new Set(current);
      if (next.has(wallKey)) next.delete(wallKey);
      else next.add(wallKey);
      return next;
    });
  }, []);

  const toggleGeneratedWallStar = useCallback((record: GeneratedWallLayoutRecord) => {
    setGeneratedWallStarredRecords((current) => {
      const index = current.findIndex((entry) => entry.recordKey === record.recordKey);
      if (index >= 0) {
        return [...current.slice(0, index), ...current.slice(index + 1)];
      }
      return [...current, record].sort(
        (left, right) =>
          left.title.localeCompare(right.title, "en") ||
          left.recordKey.localeCompare(right.recordKey, "en"),
      );
    });
  }, []);

  const importBankWallLayout = useCallback(
    (wallKey: string) => {
      if (!map || !jsonOk) return;
      commitMapChange(applyBankWallMask32ToC2mMap(wallKey));
      setIdeasDialogOpen(null);
    },
    [commitMapChange, jsonOk, map],
  );

  const importGeneratedWallLayout = useCallback(
    (record: GeneratedWallLayoutRecord) => {
      if (!record.grid || !jsonOk) return;
      commitMapChange(applyGeneratedWallGridToC2mMap(record.grid));
      setIdeasDialogOpen(null);
    },
    [commitMapChange, jsonOk],
  );

  const commitMetadataDraftChanges = useCallback(
    (nextDraft: C2mMetadataDraft) => {
      if (!doc) return;
      if (!jsonOk) {
        setMetadataError(
          "Raw JSON is invalid. Metadata changes are paused until the JSON parses again.",
        );
        return;
      }

      const currentDraft = makeMetadataDraft(doc);
      if (metadataDraftEquals(nextDraft, currentDraft)) {
        setMetadataError(null);
        return;
      }

      try {
        commitDocumentChange(applyMetadataDraft(doc, nextDraft));
        setMetadataError(null);
      } catch (err: unknown) {
        setMetadataError(asErrorMessage(err));
      }
    },
    [commitDocumentChange, doc, jsonOk],
  );

  const updateMetadataDraftField = useCallback(
    <K extends keyof C2mMetadataDraft>(field: K, value: C2mMetadataDraft[K]) => {
      if (!doc) return;

      const currentDraft = metadataDraft ?? makeMetadataDraft(doc);
      const nextDraft = { ...currentDraft, [field]: value };
      setMetadataDraft(nextDraft);
      commitMetadataDraftChanges(nextDraft);
    },
    [commitMetadataDraftChanges, doc, metadataDraft],
  );

  const updateResizeDraftField = useCallback(
    <K extends keyof MapResizeDraft>(field: K, value: MapResizeDraft[K]) => {
      setResizeDraft((current) => (current ? { ...current, [field]: value } : current));
      setResizeError(null);
    },
    [],
  );

  const applyResizeDraftChanges = useCallback(
    (nextDraft = resizeDraft) => {
      if (!map || !nextDraft) return;
      if (!canMutateBoard) {
        setResizeError(
          "Raw JSON is invalid. Resize changes are paused until the JSON parses again.",
        );
        return;
      }

      try {
        const parsed = parseMapResizeDraft(nextDraft);
        const currentDraft = makeMapResizeDraft(map);
        if (resizeDraftEquals(nextDraft, currentDraft)) {
          setResizeError(null);
          return;
        }

        resetBoardTransientState();
        commitMapChange(
          resizeMap(map, {
            width: parsed.width,
            height: parsed.height,
            anchor: parsed.anchor,
          }),
        );
        setResizeError(null);
      } catch (err: unknown) {
        setResizeError(asErrorMessage(err));
      }
    },
    [canMutateBoard, commitMapChange, map, resizeDraft, resetBoardTransientState],
  );

  const updateInspectableCellLayer = useCallback(
    (role: keyof typeof LAYER_LABELS, updater: (tile: TileSpecObjJson) => TileSpecObjJson) => {
      if (!map || !inspectorPoint) return;
      if (!canMutateBoard) {
        setCellEditError(
          "Raw JSON is invalid. Cell modifier edits are paused until the JSON parses again.",
        );
        return;
      }

      try {
        resetBoardTransientState();
        commitMapChange(updateCellLayerAtPoint(map, inspectorPoint, role, updater));
        setCellEditError(null);
      } catch (err: unknown) {
        setCellEditError(asErrorMessage(err));
      }
    },
    [canMutateBoard, commitMapChange, inspectorPoint, map, resetBoardTransientState],
  );

  const applyHistoryState = useCallback((nextHistory: C2mEditorHistory) => {
    const nextSelectedLevelEntry = getSelectedLevelEntry(
      nextHistory.doc,
      nextHistory.selectedLevelIndex,
    );
    const nextJsonText = nextSelectedLevelEntry
      ? stringifyC2mJsonV1(nextSelectedLevelEntry.doc)
      : "";
    syncedJsonTextRef.current = nextJsonText;
    setHistory(nextHistory);
    setJsonText(nextJsonText);
    setWarnings([]);
    setError(null);
    setParseError(null);
    setRenderError(null);
  }, []);

  const selectLevelAt = useCallback(
    (index: number) => {
      if (!history) return;
      if (index === history.selectedLevelIndex) return;
      if (selectionPreview && canMutateBoard) {
        commitMapChange(
          pasteMapRegion(
            selectionPreview.baseMap,
            selectionPreview.anchor,
            selectionPreview.clipboard,
          ),
        );
      }
      resetBoardTransientState({ clearSelection: true });
      setBoardMenuOpen(null);
      applyHistoryState(
        commitHistoryEvent(history, {
          type: "select-level",
          selectedLevelIndex: index,
        }),
      );
    },
    [
      applyHistoryState,
      canMutateBoard,
      commitMapChange,
      history,
      resetBoardTransientState,
      selectionPreview,
    ],
  );

  const commitLevelsetUpdate = useCallback(
    (nextLevelset: C2mLevelsetJsonV1, nextSelectedLevelIndex: number) => {
      if (!history) return;
      if (selectionPreview && canMutateBoard) {
        commitMapChange(
          pasteMapRegion(
            selectionPreview.baseMap,
            selectionPreview.anchor,
            selectionPreview.clipboard,
          ),
        );
      }
      resetBoardTransientState({ clearSelection: true });
      setBoardMenuOpen(null);
      applyHistoryState(
        commitHistoryEvent(history, {
          type: "replace-levelset",
          levelset: nextLevelset,
          selectedLevelIndex: nextSelectedLevelIndex,
        }),
      );
    },
    [
      applyHistoryState,
      canMutateBoard,
      commitMapChange,
      history,
      resetBoardTransientState,
      selectionPreview,
    ],
  );

  const addLevelAfterCurrentSelection = useCallback(() => {
    if (!levelset) return;
    const nextState = addLevelAfterSelection(levelset, selectedLevelIndex);
    commitLevelsetUpdate(nextState.levelset, nextState.selectedLevelIndex);
  }, [commitLevelsetUpdate, levelset, selectedLevelIndex]);

  const duplicateSelectedLevel = useCallback(() => {
    if (!levelset || displayedLevelCount <= 0) return;
    const nextState = duplicateLevelAtIndex(levelset, selectedLevelIndex);
    commitLevelsetUpdate(nextState.levelset, nextState.selectedLevelIndex);
  }, [commitLevelsetUpdate, displayedLevelCount, levelset, selectedLevelIndex]);

  const deleteSelectedLevel = useCallback(() => {
    if (!levelset || !canDeleteSelectedLevel) return;
    const nextState = deleteLevelAtIndex(levelset, selectedLevelIndex);
    commitLevelsetUpdate(nextState.levelset, nextState.selectedLevelIndex);
  }, [canDeleteSelectedLevel, commitLevelsetUpdate, levelset, selectedLevelIndex]);

  const moveDisplayedLevelBy = useCallback(
    (offset: -1 | 1) => {
      if (!levelset) return;
      const targetIndex = selectedLevelIndex + offset;
      if (targetIndex < 0 || targetIndex >= displayedLevelCount) return;
      const nextState = moveLevelToIndex(levelset, selectedLevelIndex, targetIndex);
      commitLevelsetUpdate(nextState.levelset, nextState.selectedLevelIndex);
    },
    [commitLevelsetUpdate, displayedLevelCount, levelset, selectedLevelIndex],
  );

  const choosePreviousLevelInList = useCallback(() => {
    if (selectedLevelIndex <= 0) return;
    selectLevelAt(selectedLevelIndex - 1);
  }, [selectLevelAt, selectedLevelIndex]);

  const chooseNextLevelInList = useCallback(() => {
    if (selectedLevelIndex >= displayedLevelCount - 1) return;
    selectLevelAt(selectedLevelIndex + 1);
  }, [displayedLevelCount, selectLevelAt, selectedLevelIndex]);

  const getDropInsertionIndex = useCallback((): number | null => {
    if (draggedLevelIndex === null || !levelDropState) return null;
    return Math.max(
      0,
      Math.min(
        levelDropState.index + (levelDropState.position === "after" ? 1 : 0),
        displayedLevelCount,
      ),
    );
  }, [displayedLevelCount, draggedLevelIndex, levelDropState]);

  const getReorderedTargetIndex = useCallback(
    (insertionIndex: number): number => {
      if (draggedLevelIndex === null) return 0;
      const adjusted = insertionIndex > draggedLevelIndex ? insertionIndex - 1 : insertionIndex;
      return Math.max(0, Math.min(adjusted, Math.max(0, displayedLevelCount - 1)));
    },
    [displayedLevelCount, draggedLevelIndex],
  );

  const getLevelDropStateFromList = useCallback(
    (listElement: HTMLDivElement, clientY: number): LevelDropState => {
      const items = Array.from(listElement.querySelectorAll<HTMLElement>(".levelListItem"));
      if (items.length === 0) return null;

      let bestMatch: LevelDropState = { index: 0, position: "before" };
      let bestDistance = Number.POSITIVE_INFINITY;

      items.forEach((item, index) => {
        const rect = item.getBoundingClientRect();
        const beforeDistance = Math.abs(clientY - rect.top);
        if (beforeDistance < bestDistance) {
          bestDistance = beforeDistance;
          bestMatch = { index, position: "before" };
        }

        const afterDistance = Math.abs(clientY - rect.bottom);
        if (afterDistance < bestDistance) {
          bestDistance = afterDistance;
          bestMatch = { index, position: "after" };
        }
      });

      return bestMatch;
    },
    [],
  );

  const handleLevelDragStart = useCallback((index: number) => {
    setDraggedLevelIndex(index);
    setLevelDropState(null);
    setBoardMenuOpen(null);
  }, []);

  const handleLevelDragOver = useCallback(
    (event: React.DragEvent<HTMLButtonElement | HTMLDivElement>, index: number) => {
      event.preventDefault();
      const target = event.currentTarget.getBoundingClientRect();
      const position = event.clientY < target.top + target.height / 2 ? "before" : "after";
      setLevelDropState((current) =>
        current?.index === index && current.position === position ? current : { index, position },
      );
    },
    [],
  );

  const handleLevelDrop = useCallback(() => {
    if (!levelset) return;
    const insertionIndex = getDropInsertionIndex();
    if (draggedLevelIndex === null || insertionIndex === null || displayedLevelCount <= 0) return;

    const targetIndex = getReorderedTargetIndex(insertionIndex);
    if (draggedLevelIndex !== targetIndex) {
      const nextState = moveLevelToIndex(levelset, draggedLevelIndex, targetIndex);
      commitLevelsetUpdate(nextState.levelset, nextState.selectedLevelIndex);
    }

    setDraggedLevelIndex(null);
    setLevelDropState(null);
  }, [
    commitLevelsetUpdate,
    displayedLevelCount,
    draggedLevelIndex,
    getDropInsertionIndex,
    getReorderedTargetIndex,
    levelset,
  ]);

  const resolveBoardCellAtClientPoint = useCallback(
    (clientX: number, clientY: number): GridPoint | null => {
      if (!activeMap || !boardRect) return null;

      const viewport = boardViewportRef.current;
      if (!viewport) return null;

      return boardPointToCell(
        viewportClientPointToBoardPoint(
          viewport.getBoundingClientRect(),
          { clientX, clientY },
          boardRect,
          boardPixelWidth,
          boardPixelHeight,
        ),
        activeMap,
      );
    },
    [activeMap, boardPixelHeight, boardPixelWidth, boardRect],
  );

  const resolveBoardCellSpacePointAtClientPoint = useCallback(
    (clientX: number, clientY: number): Readonly<{ x: number; y: number }> | null => {
      if (!boardRect) return null;

      const viewport = boardViewportRef.current;
      if (!viewport) return null;

      const boardPoint = viewportClientPointToBoardPoint(
        viewport.getBoundingClientRect(),
        { clientX, clientY },
        boardRect,
        boardPixelWidth,
        boardPixelHeight,
      );
      if (!boardPoint) return null;

      return {
        x: boardPoint.x / BOARD_TILE_PIXEL_SIZE,
        y: boardPoint.y / BOARD_TILE_PIXEL_SIZE,
      };
    },
    [boardPixelHeight, boardPixelWidth, boardRect],
  );

  const updateHoverAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const hoverPoint = resolveBoardCellAtClientPoint(clientX, clientY);
      const cursorPoint = resolveBoardCellSpacePointAtClientPoint(clientX, clientY);

      boardStatusStoreRef.current.update({
        hoverPoint,
        hoverCellSummary: buildHoverCellSummary(activeMap, hoverPoint),
      });
      setHoverCursorPoint(cursorPoint);
    },
    [activeMap, resolveBoardCellAtClientPoint, resolveBoardCellSpacePointAtClientPoint],
  );

  const setBoardZoom = useCallback(
    (nextZoom: number) => {
      if (!activeMap) return;

      const boardZoom = clampZoom(nextZoom);
      const nextPan = clampBoardPan({
        boardPixelWidth,
        boardPixelHeight,
        boardPan: boardStatus.boardPan,
        boardZoom,
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
      });

      boardStatusStoreRef.current.update({
        boardZoom,
        boardPan: nextPan,
      });
    },
    [
      activeMap,
      boardPixelHeight,
      boardPixelWidth,
      boardStatus.boardPan,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  const toggleBoardMenu = useCallback((menu: BoardMenuId) => {
    setBoardMenuOpen((current) => (current === menu ? null : menu));
  }, []);

  const assignPaletteBrush = useCallback(
    (brush: TileSpecJson, target: PaletteAssignmentTarget) => {
      setPastePreviewActive(false);
      setLastPaletteAssignmentTarget(target);
      if (tool === "wire") setTool("brush");
      const logicModifier = getTileModifier(toTileSpecObj(brush), "LOGIC");
      if (logicModifier?.kind === "LOGIC" && logicModifier.gate === "COUNTER") {
        setLogicCounterValue(logicModifier.counterValue ?? 0);
      }
      if (target === "secondary") {
        setSecondaryBrush(brush);
        return;
      }
      setPrimaryBrush(brush);
    },
    [tool],
  );

  const rotateBrushForGlobalDirection = useCallback(
    (brush: TileSpecJson, direction: BrushCycleDirection): TileSpecJson => {
      const tile = toTileSpecObj(brush);
      const logicModifier = getTileModifier(tile, "LOGIC");
      if (
        tile.tile === "CUSTOM_WALL" ||
        tile.tile === "CUSTOM_FLOOR" ||
        tile.tile === "LETTER_TILE" ||
        (logicModifier?.kind === "LOGIC" && logicModifier.gate === "COUNTER")
      ) {
        return brush;
      }
      return rotateBrushSpec(brush, direction) ?? brush;
    },
    [],
  );

  const rotateGlobalDirection = useCallback(
    (direction: BrushCycleDirection) => {
      setGlobalDirection((current) => rotateDir(current, direction));
      setPrimaryBrush((current) => rotateBrushForGlobalDirection(current, direction));
      setSecondaryBrush((current) => rotateBrushForGlobalDirection(current, direction));
    },
    [rotateBrushForGlobalDirection],
  );

  const rotateSelectedPaletteBrush = useCallback(
    (direction: BrushCycleDirection) => {
      const target = lastPaletteAssignmentTarget;
      const currentBrush = target === "secondary" ? secondaryBrush : primaryBrush;
      const currentTile = toTileSpecObj(currentBrush);
      const logicModifier = getTileModifier(currentTile, "LOGIC");

      if (
        currentTile.tile === "CUSTOM_WALL" ||
        currentTile.tile === "LETTER_TILE" ||
        (logicModifier?.kind === "LOGIC" && logicModifier.gate === "COUNTER")
      ) {
        const nextBrush = rotateBrushSpec(currentBrush, direction);
        if (!nextBrush) return;
        if (logicModifier?.kind === "LOGIC" && logicModifier.gate === "COUNTER") {
          const nextCounter = getTileModifier(toTileSpecObj(nextBrush), "LOGIC");
          if (nextCounter?.kind === "LOGIC" && nextCounter.gate === "COUNTER") {
            setLogicCounterValue(nextCounter.counterValue ?? 0);
          }
        }
        assignPaletteBrush(nextBrush, target);
        return;
      }

      rotateGlobalDirection(direction);
    },
    [
      assignPaletteBrush,
      lastPaletteAssignmentTarget,
      primaryBrush,
      rotateGlobalDirection,
      secondaryBrush,
    ],
  );

  const commitSelectionPreview = useCallback(
    (options: Readonly<{ clearSelection?: boolean }> = {}): SelectionArea | null => {
      if (!selectionPreview || !canMutateBoard) {
        if (options.clearSelection) setSelection(null);
        return selection;
      }

      const nextMap = pasteMapRegion(
        selectionPreview.baseMap,
        selectionPreview.anchor,
        selectionPreview.clipboard,
      );
      const nextSelection =
        buildMovedSelection(
          map ?? nextMap,
          selectionPreview.anchor,
          selectionPreview.clipboard,
          selectionPreview.selectionMode,
        ) ?? selection;
      commitMapChange(nextMap);
      setSelectionPreview(null);
      setSelection(options.clearSelection ? null : nextSelection);
      return options.clearSelection ? null : nextSelection;
    },
    [canMutateBoard, commitMapChange, map, selection, selectionPreview],
  );

  const applySelectionTransform = useCallback(
    (kind: LevelTransformKind) => {
      if (!map || !selection || tool !== "select" || !canMutateBoard) return;

      const preview = selectionPreview ?? createSelectionPreviewState(map, selection);
      const nextClipboard = transformC2mClipboard(preview.clipboard, kind);
      const nextSelection = buildMovedSelection(
        map,
        preview.anchor,
        nextClipboard,
        preview.selectionMode,
      );
      if (!nextSelection) return;

      setSelectionPreview({
        ...preview,
        clipboard: nextClipboard,
      });
      setSelection(nextSelection);
      setPastePreviewActive(false);
      setSelectionTransformMenu(null);
    },
    [canMutateBoard, map, selection, selectionPreview, tool],
  );

  const copySelection = useCallback(() => {
    if (!selection) return;
    setClipboard(
      selectionPreview
        ? selectionPreview.clipboard
        : map
          ? copyMapRegion(map, selection, resolveSelectionIndices(selection, map))
          : null,
    );
    setTool("select");
  }, [map, selection, selectionPreview]);

  const cutSelection = useCallback(() => {
    if (!selection || !canMutateBoard) return;
    if (selectionPreview) {
      setClipboard(selectionPreview.clipboard);
      commitMapChange(selectionPreview.baseMap);
      setSelectionPreview(null);
      setPastePreviewActive(true);
      setSelectionTransformMenu(null);
      return;
    }
    if (!map) return;
    setClipboard(copyMapRegion(map, selection, resolveSelectionIndices(selection, map)));
    setTool("select");
    setPastePreviewActive(true);
    commitMapChange(paintMapCells(map, resolveSelectionIndices(selection, map), ERASER_BRUSH));
  }, [canMutateBoard, commitMapChange, map, selection, selectionPreview]);

  const clearSelectionState = useCallback(() => {
    commitSelectionPreview({ clearSelection: true });
    setPastePreviewActive(false);
    setSelectionTransformMenu(null);
  }, [commitSelectionPreview]);

  const handleSelectToolButtonClick = useCallback(() => {
    if (tool === "select") {
      setSelectionMode((current) => cycleSelectionMode(current));
      return;
    }
    setTool("select");
  }, [tool]);

  const eraseSelection = useCallback(() => {
    if (!selection || !canMutateBoard) return;
    if (selectionPreview) {
      commitMapChange(selectionPreview.baseMap);
      setSelectionPreview(null);
      setSelectionTransformMenu(null);
      setPastePreviewActive(false);
      return;
    }
    if (!map) return;

    const nextMap = paintMapCells(map, resolveSelectionIndices(selection, map), ERASER_BRUSH);
    commitMapChange(nextMap);
    setPastePreviewActive(false);
    setSelectionTransformMenu(null);
  }, [canMutateBoard, commitMapChange, map, selection, selectionPreview]);

  const rotateSelectedSelection = useCallback(
    (direction: "clockwise" | "counterclockwise") => {
      applySelectionTransform(direction === "clockwise" ? "ROTATE_90" : "ROTATE_270");
    },
    [applySelectionTransform],
  );

  const rotatePastePreviewClipboard = useCallback(
    (direction: "clockwise" | "counterclockwise") => {
      if (!clipboard || !pastePreviewActive || tool !== "select") return;
      setClipboard((current) =>
        current
          ? transformC2mClipboard(current, direction === "clockwise" ? "ROTATE_90" : "ROTATE_270")
          : current,
      );
    },
    [clipboard, pastePreviewActive, tool],
  );

  const clearActiveMap = useCallback(() => {
    if (!map || !canMutateBoard) return;

    resetBoardTransientState({
      clearSelection: true,
    });
    commitMapChange(clearMapToFloor(map));
  }, [canMutateBoard, commitMapChange, map, resetBoardTransientState]);

  useEffect(() => {
    if (tool === "select") return;
    clearSelectionState();
  }, [clearSelectionState, tool]);

  const beginPastePreview = useCallback(() => {
    if (!clipboard) return;
    commitSelectionPreview();
    setTool("select");
    setPastePreviewActive(true);
  }, [clipboard, commitSelectionPreview]);

  const commitPastePreview = useCallback(
    (anchorOverride?: GridPoint | null) => {
      if (!map || !clipboard || !canMutateBoard) return;

      const anchor =
        anchorOverride ??
        boardStatus.hoverPoint ??
        (selection ? { x: selection.x, y: selection.y } : { x: 0, y: 0 });
      const nextMap = pasteMapRegion(map, anchor, clipboard);
      const nextSelection =
        buildC2mPastePreviewSelection(map, anchor, clipboard) ??
        createSelectionFromRect(resolveClipboardPreviewRect(map, anchor, clipboard));

      if (commitMapChange(nextMap)) {
        setSelection({
          ...nextSelection,
          mode: selectionMode,
        });
      }
    },
    [
      boardStatus.hoverPoint,
      canMutateBoard,
      clipboard,
      commitMapChange,
      map,
      selection,
      selectionMode,
    ],
  );

  const assignEyedropperBrush = useCallback(
    (point: GridPoint, target: "primary" | "secondary") => {
      if (!activeMap) return;

      const brush = resolveEyedropperBrushAtPoint(activeMap, point);
      if (!brush) return;

      assignPaletteBrush(brush, target);
    },
    [activeMap, assignPaletteBrush],
  );

  const resolvePaintBrushForInput = useCallback(
    (button: 0 | 2): TileSpecJson => {
      if (tool === "erase") return ERASER_BRUSH;
      return button === 2 ? secondaryBrush : primaryBrush;
    },
    [primaryBrush, secondaryBrush, tool],
  );

  const shiftActiveMapWrap = useCallback(
    (dx: number, dy: number) => {
      if (!map || !canMutateBoard) return;
      resetBoardTransientState();
      commitMapChange(shiftMapWrap(map, dx, dy));
    },
    [canMutateBoard, commitMapChange, map, resetBoardTransientState],
  );

  const resizeActiveMapEdge = useCallback(
    (edge: ResizeEdge, delta: -1 | 1) => {
      if (!map || !canMutateBoard || !canResizeMapEdge(map, edge, delta)) return;
      resetBoardTransientState();
      const nextMap = resizeMapEdge(map, {
        edge,
        delta,
      });
      const boardSnapshot = boardStatusStoreRef.current.getSnapshot();

      if (!commitMapChange(nextMap)) return;

      boardStatusStoreRef.current.update({
        boardPan: resolveBoardPanAfterEdgeResize({
          edge,
          previousBoardPixelWidth: map.width * BOARD_TILE_PIXEL_SIZE,
          previousBoardPixelHeight: map.height * BOARD_TILE_PIXEL_SIZE,
          nextBoardPixelWidth: nextMap.width * BOARD_TILE_PIXEL_SIZE,
          nextBoardPixelHeight: nextMap.height * BOARD_TILE_PIXEL_SIZE,
          boardPan: boardSnapshot.boardPan,
          boardZoom: boardSnapshot.boardZoom,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
        }),
      });
    },
    [
      canMutateBoard,
      commitMapChange,
      map,
      resetBoardTransientState,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setTilesetError(null);
        const nextTileset = await loadCc2Tileset(TILESET_URL);
        if (cancelled) return;
        setTileset(nextTileset);
      } catch (err: unknown) {
        if (cancelled) return;
        setTileset(null);
        setTilesetError(
          `Tileset not loaded.\nExpected: web/public/cc2/spritesheet.png\nError: ${asErrorMessage(err)}`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistRecentSetsToStorage = useCallback(
    (entries: ReadonlyArray<PersistedRecentSetEntry>): ReadonlyArray<PersistedRecentSetEntry> => {
      let candidate = [...entries];
      while (candidate.length > 0) {
        if (writeLocalStorage(RECENT_SETS_STORAGE_KEY, serializePersistedRecentSets(candidate))) {
          recentSetsRef.current = candidate;
          setRecentSets(candidate);
          return candidate;
        }
        candidate = candidate.slice(0, -1);
      }

      const fallback = recentSetsRef.current;
      if (
        fallback.length > 0 &&
        writeLocalStorage(RECENT_SETS_STORAGE_KEY, serializePersistedRecentSets(fallback))
      ) {
        setRecentSets(fallback);
        return fallback;
      }

      removeLocalStorage(RECENT_SETS_STORAGE_KEY);
      recentSetsRef.current = [];
      setRecentSets([]);
      return [];
    },
    [],
  );

  const persistRecentSetSnapshot = useCallback(
    (
      snapshot: Readonly<{
        levelset: C2mLevelsetJsonV1;
        fileName: string;
        selectedLevelIndex: number;
        recentSetId?: string | null;
      }>,
    ): string | null => {
      const nextRecentSetId = snapshot.recentSetId ?? createRecentSetId();
      const selectedLevelEntry = getSelectedLevelEntry(
        snapshot.levelset,
        snapshot.selectedLevelIndex,
      );
      const persistedEntries = persistRecentSetsToStorage(
        upsertRecentSetEntry(
          recentSetsRef.current,
          createPersistedRecentSetEntry({
            id: nextRecentSetId,
            levelset: snapshot.levelset,
            fileName: snapshot.fileName,
            selectedLevelIndex: snapshot.selectedLevelIndex,
            thumbnailDataUrl: selectedLevelEntry
              ? renderRecentLevelThumbnail(selectedLevelEntry.doc, latestAutosaveTilesetRef.current)
              : null,
          }),
        ),
      );

      return persistedEntries.some((entry) => entry.id === nextRecentSetId)
        ? nextRecentSetId
        : null;
    },
    [persistRecentSetsToStorage],
  );

  const flushAutosavedRecentSet = useCallback(() => {
    const snapshot = latestSessionSnapshotRef.current;
    if (!snapshot) return;

    const nextRecentSetId = persistRecentSetSnapshot({
      levelset: snapshot.levelset,
      fileName: snapshot.fileName,
      selectedLevelIndex: snapshot.selectedLevelIndex,
      recentSetId: activeRecentSetIdRef.current,
    });

    activeRecentSetIdRef.current = nextRecentSetId;
    setActiveRecentSetId(nextRecentSetId);
  }, [persistRecentSetSnapshot]);

  const loadLevelset = useCallback(
    (
      nextLevelset: C2mLevelsetJsonV1,
      options: Readonly<{
        fileName?: string | null;
        warnings?: ReadonlyArray<string>;
        recentSetId?: string | null;
        selectedLevelIndex?: number;
      }> = {},
    ) => {
      const nextSelectedLevelIndex = options.selectedLevelIndex ?? 0;
      const nextFileName = options.fileName ?? DEFAULT_C2M_FILE_NAME;
      const nextRecentSetId = persistRecentSetSnapshot({
        levelset: nextLevelset,
        fileName: nextFileName,
        selectedLevelIndex: nextSelectedLevelIndex,
        ...(options.recentSetId !== undefined ? { recentSetId: options.recentSetId } : {}),
      });
      const nextSelectedLevelEntry = getSelectedLevelEntry(nextLevelset, nextSelectedLevelIndex);
      const nextJsonText = nextSelectedLevelEntry
        ? stringifyC2mJsonV1(nextSelectedLevelEntry.doc)
        : "";
      syncedJsonTextRef.current = nextJsonText;
      setHistory(createEditorHistory(nextLevelset, nextSelectedLevelIndex));
      setJsonText(nextJsonText);
      setFileName(nextFileName);
      activeRecentSetIdRef.current = nextRecentSetId;
      setActiveRecentSetId(nextRecentSetId);
      setWarnings([...(options.warnings ?? [])]);
      setError(null);
      setParseError(null);
      setRenderError(null);
      setC2gEditorOpen(false);
      setC2gDraftError(null);
    },
    [persistRecentSetSnapshot],
  );

  const loadDocument = useCallback(
    (
      nextDoc: C2mJsonV1,
      options: Readonly<{
        fileName?: string | null;
        warnings?: ReadonlyArray<string>;
        recentSetId?: string | null;
      }> = {},
    ) => {
      loadLevelset(
        createSingleLevelset(nextDoc, {
          fileName: options.fileName ?? DEFAULT_C2M_FILE_NAME,
          ...(options.warnings ? { warnings: options.warnings } : {}),
          source: "existing",
        }),
        options,
      );
    },
    [loadLevelset],
  );

  const loadOpenedDocumentSource = useCallback(
    (openedSource: OpenedDocumentSource) => {
      setError(null);
      setParseError(null);
      setRenderError(null);

      try {
        const recentSetId = createRecentSetId();
        const loaded = loadLevelsetFromOpenedDocumentSource(openedSource);
        loadLevelset(loaded.levelset, {
          fileName: loaded.fileName,
          warnings: loaded.warnings,
          recentSetId,
        });

        resetBoardTransientState({
          clearSelection: true,
          resetView: true,
        });
        setViewMode("board");
      } catch (err: unknown) {
        setError(asErrorMessage(err));
      }
    },
    [loadLevelset, resetBoardTransientState],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!jsonTextPresent) {
      setParseError(doc ? "JSON is empty." : null);
      return;
    }

    const handle = window.setTimeout(() => {
      try {
        const parsedDoc = parseC2mJsonV1(JSON.parse(jsonText) as unknown);
        setParseError(null);

        if (jsonText === syncedJsonTextRef.current) return;

        syncedJsonTextRef.current = jsonText;
        setHistory((current) =>
          current
            ? commitHistoryEvent(current, {
                type: "replace-levelset",
                levelset: resequenceGeneratedLevelEntries(
                  replaceLevelsetEntryDoc(current.doc, current.selectedLevelIndex, parsedDoc),
                ),
              })
            : createEditorHistory(
                createSingleLevelset(parsedDoc, {
                  fileName: fileName ?? DEFAULT_C2M_FILE_NAME,
                  source: "generated",
                }),
              ),
        );
        setWarnings([]);
        setError(null);
        setRenderError(null);
      } catch (err: unknown) {
        setParseError(asErrorMessage(err));
      }
    }, 400);

    return () => window.clearTimeout(handle);
  }, [doc, fileName, jsonText, jsonTextPresent]);

  useEffect(() => {
    if (viewMode !== "board") return;
    if (!doc) {
      lastRenderedMapRef.current = null;
      lastRenderedTilesetRef.current = null;
      lastWireSpoolOverlayPointRef.current = null;
      wireSpoolOverlayCanvasRef.current = null;
      wireSpoolOverlayTilesetRef.current = null;
      setRenderError(null);
      return;
    }

    if (!displayMap) {
      lastRenderedMapRef.current = null;
      lastRenderedTilesetRef.current = null;
      lastWireSpoolOverlayPointRef.current = null;
      wireSpoolOverlayCanvasRef.current = null;
      wireSpoolOverlayTilesetRef.current = null;
      setRenderError(null);
      return;
    }

    if (!tileset) {
      lastRenderedTilesetRef.current = null;
      lastWireSpoolOverlayPointRef.current = null;
      wireSpoolOverlayCanvasRef.current = null;
      wireSpoolOverlayTilesetRef.current = null;
      setRenderError(tilesetError ?? "Tileset not loaded.");
      return;
    }

    const canvas = boardCanvasRef.current;
    if (!canvas) return;

    try {
      const previousMap = lastRenderedMapRef.current;
      const previousWireSpoolOverlayPoint = lastWireSpoolOverlayPointRef.current;
      const sizeChanged =
        canvas.width !== displayMap.width * BOARD_TILE_PIXEL_SIZE ||
        canvas.height !== displayMap.height * BOARD_TILE_PIXEL_SIZE;
      const cache = getSharedCc2CanvasCellCache(tileset);
      const redrawPlan = resolveBoardMapRedrawPlan(previousMap, displayMap, {
        canReuseCanvas: !sizeChanged && lastRenderedTilesetRef.current === tileset,
        partialThreshold: Math.min(
          MAX_PARTIAL_REDRAW_CELLS,
          Math.max(32, Math.ceil(displayMap.tiles.length * PARTIAL_REDRAW_RATIO)),
        ),
      });
      const overlayIndices = new Set<number>();
      if (pointWithinMap(previousWireSpoolOverlayPoint, displayMap)) {
        overlayIndices.add(pointToIndex(previousWireSpoolOverlayPoint, displayMap));
      }
      if (pointWithinMap(currentWireSpoolOverlayPoint, displayMap)) {
        overlayIndices.add(pointToIndex(currentWireSpoolOverlayPoint, displayMap));
      }
      const ctx =
        redrawPlan.kind === "full"
          ? drawCc2MapToCanvas(canvas, displayMap, cache)
          : canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");

      if (redrawPlan.kind === "partial") {
        const indices = new Set(redrawPlan.indices);
        for (const index of overlayIndices) {
          indices.add(index);
        }
        if (indices.size > 0) {
          drawCc2CellsToContext(ctx, displayMap, [...indices], cache);
        }
      }

      if (pointWithinMap(currentWireSpoolOverlayPoint, displayMap)) {
        let spoolCanvas = wireSpoolOverlayCanvasRef.current;
        if (!spoolCanvas || wireSpoolOverlayTilesetRef.current !== tileset) {
          spoolCanvas = document.createElement("canvas");
          spoolCanvas.width = BOARD_TILE_PIXEL_SIZE;
          spoolCanvas.height = BOARD_TILE_PIXEL_SIZE;
          const spoolCtx = spoolCanvas.getContext("2d");
          if (!spoolCtx) throw new Error("Canvas 2D context unavailable");
          drawRgbaImageToContext(spoolCtx, tileset.draw(12, 26), 0, 0);
          wireSpoolOverlayCanvasRef.current = spoolCanvas;
          wireSpoolOverlayTilesetRef.current = tileset;
        }
        ctx.drawImage(
          spoolCanvas,
          currentWireSpoolOverlayPoint.x * BOARD_TILE_PIXEL_SIZE,
          currentWireSpoolOverlayPoint.y * BOARD_TILE_PIXEL_SIZE,
        );
      }

      setRenderError(null);
      lastRenderedMapRef.current = displayMap;
      lastRenderedTilesetRef.current = tileset;
      lastWireSpoolOverlayPointRef.current = currentWireSpoolOverlayPoint;
    } catch (err: unknown) {
      setRenderError(
        `Board rendering failed. The document is still loaded and raw JSON remains available.\n${asErrorMessage(err)}`,
      );
    }
  }, [currentWireSpoolOverlayPoint, displayMap, doc, tileset, tilesetError, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    writeLocalStorage(
      APP_PREFERENCES_STORAGE_KEY,
      serializePersistedAppPreferences({
        viewMode,
        leftPanelWidth,
        rightPanelWidth,
      }),
    );
  }, [leftPanelWidth, rightPanelWidth, viewMode]);

  useEffect(() => {
    if (!layoutResizeState) return;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== layoutResizeState.pointerId) return;

      const editorWidth = editorLayoutRef.current?.clientWidth ?? window.innerWidth;
      const deltaX = event.clientX - layoutResizeState.startClientX;

      if (layoutResizeState.side === "left") {
        const maxWidth = Math.min(
          MAX_LEFT_PANEL_WIDTH,
          editorWidth - rightPanelWidth - SPLITTER_WIDTH * 2 - MIN_BOARD_COLUMN_WIDTH,
        );
        setLeftPanelWidth(
          clampNumber(layoutResizeState.startWidth + deltaX, MIN_LEFT_PANEL_WIDTH, maxWidth),
        );
        return;
      }

      const maxWidth = Math.min(
        MAX_RIGHT_PANEL_WIDTH,
        editorWidth - leftPanelWidth - SPLITTER_WIDTH * 2 - MIN_BOARD_COLUMN_WIDTH,
      );
      setRightPanelWidth(
        clampNumber(layoutResizeState.startWidth - deltaX, MIN_RIGHT_PANEL_WIDTH, maxWidth),
      );
    };

    const stopResize = (event: PointerEvent) => {
      if (event.pointerId !== layoutResizeState.pointerId) return;
      setLayoutResizeState(null);
    };

    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stopResize);
    document.addEventListener("pointercancel", stopResize);
    return () => {
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopResize);
      document.removeEventListener("pointercancel", stopResize);
    };
  }, [layoutResizeState, leftPanelWidth, rightPanelWidth]);

  useEffect(() => {
    if (!mirrorDragState || !boardRect) return;

    const updateMirrorOffset = (clientX: number, clientY: number) => {
      const viewportRect = boardViewportRef.current?.getBoundingClientRect();
      if (!viewportRect) return;

      setMirrorState((current) =>
        setMirrorOffset(
          current,
          mirrorDragState.kind,
          resolveMirrorDragOffset(
            mirrorDragState.kind,
            clientX,
            clientY,
            {
              left: viewportRect.left + boardRect.x,
              top: viewportRect.top + boardRect.y,
              width: boardRect.width,
              height: boardRect.height,
            },
            mirrorBoardSize,
          ),
          mirrorBoardSize,
        ),
      );
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== mirrorDragState.pointerId) return;
      const moved =
        Math.abs(event.clientX - mirrorDragState.startClientX) > 3 ||
        Math.abs(event.clientY - mirrorDragState.startClientY) > 3;
      if (moved && !mirrorDragState.moved) {
        setMirrorDragState((current) => (current ? { ...current, moved: true } : current));
      }
      updateMirrorOffset(event.clientX, event.clientY);
    };

    const stopDrag = (event: PointerEvent) => {
      if (event.pointerId !== mirrorDragState.pointerId) return;
      const moved =
        mirrorDragState.moved ||
        Math.abs(event.clientX - mirrorDragState.startClientX) > 3 ||
        Math.abs(event.clientY - mirrorDragState.startClientY) > 3;

      if (moved) {
        updateMirrorOffset(event.clientX, event.clientY);
        setMirrorState((current) =>
          current[mirrorDragState.kind].active
            ? current
            : toggleMirrorActive(current, mirrorDragState.kind),
        );
      } else {
        setMirrorState((current) => toggleMirrorActive(current, mirrorDragState.kind));
      }

      setMirrorDragState(null);
    };

    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stopDrag);
    document.addEventListener("pointercancel", stopDrag);
    return () => {
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopDrag);
      document.removeEventListener("pointercancel", stopDrag);
    };
  }, [boardRect, mirrorBoardSize, mirrorDragState]);

  useEffect(() => {
    persistStringSet(C2M_WALLS_STARRED_STORAGE_KEY, wallsStarredKeys);
  }, [wallsStarredKeys]);

  useEffect(() => {
    persistStringSet(C2M_WALLS_HIDDEN_STORAGE_KEY, wallsHiddenKeys);
  }, [wallsHiddenKeys]);

  useEffect(() => {
    writeLocalStorage(
      C2M_GENERATED_WALLS_STARRED_STORAGE_KEY,
      serializePersistedGeneratedLayoutRecordList(generatedWallStarredRecords),
    );
  }, [generatedWallStarredRecords]);

  useEffect(() => {
    if (ideasDialogOpen !== "browse-walls" || wallsBankRecords.length > 0) return;

    const controller = new AbortController();
    setWallsBankLoadState("loading");
    setWallsBankErrorMessage(null);

    loadWallsBank(controller.signal)
      .then((loaded) => {
        setWallsBankRecords(loaded.records);
        setWallsBankLoadState("ready");
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setWallsBankLoadState("error");
        setWallsBankErrorMessage(asErrorMessage(err));
      });

    return () => {
      controller.abort();
    };
  }, [ideasDialogOpen, wallsBankRecords.length]);

  function beginLayoutResize(
    event: ReactPointerEvent<HTMLDivElement>,
    side: "left" | "right",
  ): void {
    event.preventDefault();
    setLayoutResizeState({
      side,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: side === "left" ? leftPanelWidth : rightPanelWidth,
    });
  }

  function beginMirrorDrag(kind: MirrorKind, event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    setMirrorDragState({
      kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    });
  }

  function resolveBoardMenuDropdownStyle(menu: BoardMenuId): CSSProperties | undefined {
    if (boardMenuOpen !== menu || boardMenuDropdownShift === 0) return undefined;
    return { transform: `translateX(${boardMenuDropdownShift}px)` };
  }

  useEffect(() => {
    recentSetsRef.current = recentSets;
  }, [recentSets]);

  useEffect(() => {
    activeRecentSetIdRef.current = activeRecentSetId;
  }, [activeRecentSetId]);

  useEffect(() => {
    latestAutosaveTilesetRef.current = tileset;
  }, [tileset]);

  useEffect(() => {
    latestSessionSnapshotRef.current =
      history && fileName
        ? {
            levelset: history.doc,
            selectedLevelIndex: history.selectedLevelIndex,
            fileName,
          }
        : null;
  }, [fileName, history]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const flushPersistedSession = () => {
      flushAutosavedRecentSet();
      const snapshot = latestSessionSnapshotRef.current;
      if (!snapshot) {
        removeLocalStorage(EDITOR_SESSION_STORAGE_KEY);
        return;
      }

      writeLocalStorage(EDITOR_SESSION_STORAGE_KEY, serializePersistedEditorSession(snapshot));
    };

    window.addEventListener("pagehide", flushPersistedSession);
    return () => {
      window.removeEventListener("pagehide", flushPersistedSession);
    };
  }, [flushAutosavedRecentSet]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (recentPersistTimeoutRef.current !== null) {
      window.clearTimeout(recentPersistTimeoutRef.current);
    }

    if (!history) return;

    recentPersistTimeoutRef.current = window.setTimeout(() => {
      flushAutosavedRecentSet();
      recentPersistTimeoutRef.current = null;
    }, DOCUMENT_PERSIST_DEBOUNCE_MS);

    return () => {
      if (recentPersistTimeoutRef.current !== null) {
        window.clearTimeout(recentPersistTimeoutRef.current);
      }
    };
  }, [fileName, flushAutosavedRecentSet, history, tileset]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (sessionPersistTimeoutRef.current !== null) {
      window.clearTimeout(sessionPersistTimeoutRef.current);
    }

    if (!history) {
      removeLocalStorage(EDITOR_SESSION_STORAGE_KEY);
      return;
    }

    const persistSession = () => {
      writeLocalStorage(
        EDITOR_SESSION_STORAGE_KEY,
        serializePersistedEditorSession({
          levelset: history.doc,
          selectedLevelIndex: history.selectedLevelIndex,
          fileName: fileName ?? DEFAULT_C2M_FILE_NAME,
        }),
      );
      sessionPersistTimeoutRef.current = null;
    };

    sessionPersistTimeoutRef.current = window.setTimeout(
      persistSession,
      DOCUMENT_PERSIST_DEBOUNCE_MS,
    );

    return () => {
      if (sessionPersistTimeoutRef.current !== null) {
        window.clearTimeout(sessionPersistTimeoutRef.current);
      }
    };
  }, [fileName, history]);

  useEffect(() => {
    const viewport = boardViewportRef.current;
    if (!viewport) return;

    const updateViewportSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    updateViewportSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportSize);
      return () => {
        window.removeEventListener("resize", updateViewportSize);
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [viewMode]);

  useEffect(() => {
    if (!activeMap || viewportSize.width <= 0 || viewportSize.height <= 0) return;

    const nextPan = clampBoardPan({
      boardPixelWidth,
      boardPixelHeight,
      boardPan: boardStatus.boardPan,
      boardZoom: boardStatus.boardZoom,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
    });

    if (nextPan.x === boardStatus.boardPan.x && nextPan.y === boardStatus.boardPan.y) return;

    boardStatusStoreRef.current.update({
      boardPan: nextPan,
    });
  }, [
    activeMap,
    boardPixelHeight,
    boardPixelWidth,
    boardStatus.boardPan,
    boardStatus.boardZoom,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    boardStatusStoreRef.current.update({
      hoverCellSummary: buildHoverCellSummary(activeMap, boardStatus.hoverPoint),
    });
  }, [activeMap, boardStatus.hoverPoint]);

  useEffect(() => {
    if (!map || !selection) return;

    if (selection.indices) {
      const nextIndices = selection.indices.filter(
        (index) => index >= 0 && index < map.tiles.length,
      );
      const nextSelection = buildSelectionFromIndices(nextIndices, map, selection.mode);
      const currentIndices = resolveSelectionIndices(selection, map);
      const nextSelectionIndices = resolveSelectionIndices(nextSelection, map);
      const changed =
        currentIndices.length !== nextSelectionIndices.length ||
        currentIndices.some((index, entryIndex) => nextSelectionIndices[entryIndex] !== index);
      if (changed || !nextSelection) {
        setSelection(nextSelection);
      }
      return;
    }

    const nextSelection = normalizeRect(
      { x: selection.x, y: selection.y },
      { x: selection.x + selection.width - 1, y: selection.y + selection.height - 1 },
      map,
    );

    if (
      nextSelection.x === selection.x &&
      nextSelection.y === selection.y &&
      nextSelection.width === selection.width &&
      nextSelection.height === selection.height
    ) {
      return;
    }

    setSelection({
      ...nextSelection,
      mode: selection.mode,
    });
  }, [map, selection]);

  useEffect(() => {
    setMetadataDraft(doc ? makeMetadataDraft(doc) : null);
    setMetadataError(null);
  }, [doc]);

  useEffect(() => {
    setResizeDraft(map ? makeMapResizeDraft(map) : null);
    setResizeError(null);
  }, [map]);

  useEffect(() => {
    setCellEditError(null);
  }, [inspectableCell?.index, map]);

  useEffect(() => {
    setFileName(selectedLevelEntry?.fileName ?? null);
  }, [selectedLevelEntry?.fileName, selectedLevelEntry?.id]);

  useEffect(() => {
    if (dragState?.tool === "brush") return;
    if (transientMap) setTransientMap(null);
  }, [dragState, transientMap]);

  useEffect(() => {
    if (tool === "select" || dragState?.tool !== "select") return;
    setDragState(null);
  }, [dragState, tool]);

  useEffect(() => {
    if (!boardMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".menuWrap")) return;
      setBoardMenuOpen(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBoardMenuOpen(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [boardMenuOpen]);

  useEffect(() => {
    if (!boardMenuOpen) {
      setBoardMenuDropdownShift(0);
      return;
    }

    const measure = () => {
      const menuBar = boardMenuBarRef.current;
      const menuWrap = boardMenuWrapRefs.current[boardMenuOpen];
      const dropdown = menuWrap?.querySelector(".dropdownMenu");
      if (!menuBar || !(dropdown instanceof HTMLDivElement)) {
        setBoardMenuDropdownShift(0);
        return;
      }

      const menuBarRect = menuBar.getBoundingClientRect();
      const dropdownRect = dropdown.getBoundingClientRect();
      const padding = 4;
      const overflowRight = dropdownRect.right - (menuBarRect.right - padding);
      const overflowLeft = menuBarRect.left + padding - dropdownRect.left;
      let shift = 0;
      if (overflowRight > 0) shift -= overflowRight;
      if (overflowLeft > 0) shift += overflowLeft;
      setBoardMenuDropdownShift(Math.round(shift));
    };

    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [boardMenuOpen, leftPanelWidth]);

  useEffect(() => {
    if (!recentModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRecentModalOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [recentModalOpen]);

  const onUndo = useCallback(() => {
    if (!history || !canUndo) return;
    resetBoardTransientState();
    applyHistoryState(undoEditorHistory(history));
  }, [applyHistoryState, canUndo, history, resetBoardTransientState]);

  const onRedo = useCallback(() => {
    if (!history || !canRedo) return;
    resetBoardTransientState();
    applyHistoryState(redoEditorHistory(history));
  }, [applyHistoryState, canRedo, history, resetBoardTransientState]);

  useEffect(() => {
    if (viewMode !== "board") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;

      if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === "," || event.key === "<") {
          event.preventDefault();
          if (tool === "select" && pastePreviewActive && clipboard) {
            rotatePastePreviewClipboard("counterclockwise");
          } else if (tool === "select" && selection) rotateSelectedSelection("counterclockwise");
          else rotateSelectedPaletteBrush("counterclockwise");
          return;
        }

        if (event.key === "." || event.key === ">") {
          event.preventDefault();
          if (tool === "select" && pastePreviewActive && clipboard) {
            rotatePastePreviewClipboard("clockwise");
          } else if (tool === "select" && selection) rotateSelectedSelection("clockwise");
          else rotateSelectedPaletteBrush("clockwise");
          return;
        }
      }

      const command = resolveEditorShortcut(event, {
        hasSelection: selection !== null,
        hasClipboard: clipboard !== null,
        pastePreviewActive,
      });
      if (!command) return;

      switch (command.type) {
        case "undo":
          if (!canUndo) return;
          event.preventDefault();
          onUndo();
          return;
        case "redo":
          if (!canRedo) return;
          event.preventDefault();
          onRedo();
          return;
        case "next-level":
          event.preventDefault();
          chooseNextLevelInList();
          return;
        case "previous-level":
          event.preventDefault();
          choosePreviousLevelInList();
          return;
        case "cut-selection":
          if (!selection || !canMutateBoard) return;
          event.preventDefault();
          cutSelection();
          return;
        case "copy-selection":
          if (!selection) return;
          event.preventDefault();
          copySelection();
          return;
        case "start-paste-preview":
          if (!clipboard) return;
          event.preventDefault();
          beginPastePreview();
          return;
        case "commit-paste-preview":
          if (!pastePreviewActive || !clipboard) return;
          event.preventDefault();
          commitPastePreview();
          return;
        case "cancel-selection":
          event.preventDefault();
          resetBoardTransientState();
          clearSelectionState();
          return;
        case "erase-selection":
          if (!selection || !canMutateBoard) return;
          event.preventDefault();
          eraseSelection();
          return;
        case "set-tool":
          event.preventDefault();
          if (command.tool === "select") handleSelectToolButtonClick();
          else setTool(command.tool);
          return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [
    beginPastePreview,
    canMutateBoard,
    canRedo,
    canUndo,
    chooseNextLevelInList,
    choosePreviousLevelInList,
    clearSelectionState,
    clipboard,
    commitPastePreview,
    cutSelection,
    copySelection,
    eraseSelection,
    onRedo,
    onUndo,
    pastePreviewActive,
    rotatePastePreviewClipboard,
    resetBoardTransientState,
    rotateSelectedSelection,
    rotateSelectedPaletteBrush,
    selection,
    handleSelectToolButtonClick,
    tool,
    viewMode,
  ]);

  const onNewClick = useCallback(() => {
    loadDocument(createEmptyC2mDoc(), {
      fileName: DEFAULT_C2M_FILE_NAME,
      recentSetId: createRecentSetId(),
    });
    resetBoardTransientState({
      clearSelection: true,
      resetView: true,
    });
    setViewMode("board");
  }, [loadDocument, resetBoardTransientState]);

  const onOpenClick = useCallback(() => {
    void (async () => {
      try {
        const openedSource = await platform.openDocumentSource();
        if (!openedSource) return;
        loadOpenedDocumentSource(openedSource);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        setError(asErrorMessage(err));
      }
    })();
  }, [loadOpenedDocumentSource]);

  const onOpenRecentClick = useCallback(() => {
    setRecentModalOpen(true);
  }, []);

  const openC2gEditor = useCallback(() => {
    if (!levelset) return;
    setBoardMenuOpen(null);
    setC2gDraftText(serializeC2gText(levelset.c2g));
    setC2gDraftError(null);
    setC2gEditorOpen(true);
  }, [levelset]);

  const saveC2gDraft = useCallback(() => {
    if (!levelset) return;

    try {
      const nextState = applyRawC2gTextToLevelset(levelset, c2gDraftText, selectedLevelIndex);
      commitLevelsetUpdate(nextState.levelset, nextState.selectedLevelIndex);
      setC2gEditorOpen(false);
      setC2gDraftError(null);
    } catch (err: unknown) {
      setC2gDraftError(asErrorMessage(err));
    }
  }, [c2gDraftText, commitLevelsetUpdate, levelset, selectedLevelIndex]);

  const openRecentSet = useCallback(
    (entry: PersistedRecentSetEntry) => {
      try {
        const restored = decodePersistedRecentSetEntry(entry);
        loadLevelset(restored.levelset, {
          fileName: restored.fileName,
          recentSetId: entry.id,
          selectedLevelIndex: restored.selectedLevelIndex,
        });
        resetBoardTransientState({
          clearSelection: true,
          resetView: true,
        });
        setRecentModalOpen(false);
        setViewMode("board");
        setError(null);
      } catch (err: unknown) {
        setError(asErrorMessage(err));
      }
    },
    [loadLevelset, resetBoardTransientState],
  );

  const deleteRecentSet = useCallback(
    (id: string) => {
      if (recentPersistTimeoutRef.current !== null && activeRecentSetIdRef.current === id) {
        window.clearTimeout(recentPersistTimeoutRef.current);
        recentPersistTimeoutRef.current = null;
      }

      if (activeRecentSetIdRef.current === id) {
        activeRecentSetIdRef.current = null;
        setActiveRecentSetId(null);
      }

      persistRecentSetsToStorage(removeRecentSetEntry(recentSetsRef.current, id));
    },
    [persistRecentSetsToStorage],
  );

  const scrollRecentCarousel = useCallback((direction: -1 | 1) => {
    const element = recentCarouselRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(240, Math.round(element.clientWidth * 0.8)),
      behavior: "smooth",
    });
  }, []);

  const onSaveLevel = useCallback(() => {
    if (!doc || !jsonOk) return;

    setError(null);
    setRenderError(null);

    void platform
      .saveC2mFile(normalizeC2mFileName(fileName), encodeC2mFromJsonV1(doc))
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setError(asErrorMessage(err));
      });
  }, [doc, fileName, jsonOk]);

  const onSaveSet = useCallback(() => {
    if (!levelset || !jsonOk) return;

    setError(null);
    setRenderError(null);

    const archive = buildSavedLevelsetArchive(levelset);
    void platform.saveZipFile(archive.fileName, archive.bytes).catch((err: unknown) => {
      if (isAbortError(err)) return;
      setError(asErrorMessage(err));
    });
  }, [jsonOk, levelset]);

  const onDownloadJson = useCallback(() => {
    if (!jsonOk) return;

    setError(null);

    void platform.saveJsonFile(normalizeJsonFileName(fileName), jsonText).catch((err: unknown) => {
      if (isAbortError(err)) return;
      setError(asErrorMessage(err));
    });
  }, [fileName, jsonOk, jsonText]);

  const onTestInNotcc = useCallback(() => {
    if (!doc || !jsonOk) {
      setError("Load or fix a valid level before testing it in NotCC.");
      return;
    }

    setError(null);
    setRenderError(null);

    try {
      platform.openExternalUrl(buildNotccLevelUrl(encodeC2mFromJsonV1(doc)));
    } catch (err: unknown) {
      setError(asErrorMessage(err));
    }
  }, [doc, jsonOk]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F5") return;
      event.preventDefault();
      if (event.repeat) return;
      setBoardMenuOpen(null);
      onTestInNotcc();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onTestInNotcc]);

  const applyTransform = useCallback(
    (op: LevelTransformKind) => {
      if (!doc || !jsonOk) return;

      try {
        resetBoardTransientState();
        commitDocumentChange(transformLevelJson(doc, op));
      } catch (err: unknown) {
        setError(asErrorMessage(err));
      }
    },
    [commitDocumentChange, doc, jsonOk, resetBoardTransientState],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);

      const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
      if (files.length <= 0) return;

      void readLocalDocumentSourceList(files, "Dropped Set")
        .then((openedSource) => {
          if (!openedSource) return;
          loadOpenedDocumentSource(openedSource);
        })
        .catch((err: unknown) => {
          setError(asErrorMessage(err));
        });
    },
    [loadOpenedDocumentSource],
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const onDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const onBoardPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activeMap || !boardRect) return;

      if (isBoardPanGesture(event.nativeEvent)) {
        event.preventDefault();
        beginBoardPanGesture(event.currentTarget, event.pointerId, event.clientX, event.clientY);
        return;
      }

      if (!isSupportedBoardToolButton(event.button)) return;

      const point = resolveBoardCellAtClientPoint(event.clientX, event.clientY);
      const cursorPoint = resolveBoardCellSpacePointAtClientPoint(event.clientX, event.clientY);
      boardStatusStoreRef.current.update({
        hoverPoint: point,
        hoverCellSummary: buildHoverCellSummary(activeMap, point),
      });
      setHoverCursorPoint(cursorPoint);
      if (!point) {
        if (event.button === 0) {
          event.preventDefault();
          beginBoardPanGesture(event.currentTarget, event.pointerId, event.clientX, event.clientY);
        }
        return;
      }

      if ((event.altKey && tool !== "select") || tool === "eyedropper") {
        event.preventDefault();
        assignEyedropperBrush(point, event.button === 2 ? "secondary" : "primary");
        return;
      }

      if (tool === "select" && pastePreviewActive && clipboard && event.button === 0) {
        event.preventDefault();
        commitPastePreview(point);
        return;
      }

      if (tool === "wire") {
        if (event.button !== 0 && event.button !== 2) return;
        if (!canMutateBoard) return;
        const cell = activeMap.tiles[pointToIndex(point, activeMap)];
        if (!cell || !canPlaceWireOnCell(cell)) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const mode = event.button === 2 ? "remove" : "add";
        let nextPreviewMap = mode === "add" ? placeWireNode(activeMap, point) : activeMap;
        if (
          pendingWirePoint &&
          (pendingWirePoint.x !== point.x || pendingWirePoint.y !== point.y)
        ) {
          nextPreviewMap =
            mode === "add"
              ? connectWirePoints(nextPreviewMap, pendingWirePoint, point)
              : disconnectWirePoints(nextPreviewMap, pendingWirePoint, point);
        }
        setPastePreviewActive(false);
        replaceMapChangeLive(nextPreviewMap);
        setPendingWirePoint(point);
        setTransientMap(nextPreviewMap);
        setDragState({
          tool: "wire",
          pointerId: event.pointerId,
          lastPoint: point,
          baseMap: map ?? activeMap,
          previewMap: nextPreviewMap,
          mode,
        });
        boardStatusStoreRef.current.update({
          hoverPoint: point,
          hoverCellSummary: buildHoverCellSummary(nextPreviewMap, point),
        });
        return;
      }

      if (tool === "select") {
        if (event.button !== 0) return;
        event.preventDefault();
        if (
          !pastePreviewActive &&
          selection &&
          canMutateBoard &&
          isSelectionBorderPoint(selection, point, cursorPoint, activeMap)
        ) {
          const preview = selectionPreview ?? createSelectionPreviewState(activeMap, selection);
          const selectionIndices = resolveSelectionIndices(selection, activeMap);
          event.currentTarget.setPointerCapture(event.pointerId);
          setPastePreviewActive(false);
          setSelectionTransformMenu(null);
          setDragState({
            tool: "move-selection",
            pointerId: event.pointerId,
            baseMap: preview.baseMap,
            clipboard: preview.clipboard,
            sourceSelection: selection,
            sourceIndices: selectionIndices,
            selectionMode: selection.mode,
            originAnchor: clampPoint({ x: selection.x, y: selection.y }, activeMap),
            currentAnchor: clampPoint({ x: selection.x, y: selection.y }, activeMap),
            grabOffset: {
              x: point.x - selection.x,
              y: point.y - selection.y,
            },
          });
          return;
        }
        const operation = resolveSelectionOperationFromModifierKeys(event.shiftKey, event.altKey);
        const selectionBase = selectionPreview
          ? pasteMapRegion(
              selectionPreview.baseMap,
              selectionPreview.anchor,
              selectionPreview.clipboard,
            )
          : activeMap;
        if (selectionPreview) {
          commitMapChange(selectionBase);
          setSelectionPreview(null);
        }
        if (selectionMode === "rect") {
          event.currentTarget.setPointerCapture(event.pointerId);
          setPastePreviewActive(false);
          setSelectionTransformMenu(null);
          setDragState({
            tool: "select",
            pointerId: event.pointerId,
            start: point,
            current: point,
            mode: selectionMode,
            operation,
          });
          return;
        }

        setPastePreviewActive(false);
        setSelectionTransformMenu(null);
        setSelection(
          applySelectionOperation(
            selection,
            selectionMode === "contiguous"
              ? resolveContiguousTileSelection(selectionBase, point)
              : resolveTileMatchSelection(selectionBase, point),
            selectionBase,
            operation,
            selectionMode,
          ),
        );
        return;
      }

      if (!canMutateBoard) return;

      if (tool === "fill") {
        event.preventDefault();
        commitMapChange(
          hasActiveMirrors
            ? applyMirroredMapFill(
                activeMap,
                point,
                resolvePaintBrushForInput(event.button),
                mirrorState,
              )
            : floodFillMap(activeMap, point, resolvePaintBrushForInput(event.button)),
        );
        setPastePreviewActive(false);
        return;
      }

      if (tool === "text") {
        const textIndices = resolveTextBrushPlacementIndices(textBrushRaster, point, activeMap);
        if (textIndices.length === 0) return;
        event.preventDefault();
        commitMapChange(
          hasActiveMirrors
            ? applyMirroredMapPaint(
                activeMap,
                textIndices,
                resolvePaintBrushForInput(event.button),
                mirrorState,
              )
            : paintMapCells(activeMap, textIndices, resolvePaintBrushForInput(event.button)),
        );
        setPastePreviewActive(false);
        return;
      }

      if (tool === "line") {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setPastePreviewActive(false);
        setDragState({
          tool: "line",
          pointerId: event.pointerId,
          start: point,
          current: point,
          brush: resolvePaintBrushForInput(event.button),
        });
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const previewMap = hasActiveMirrors
        ? applyMirroredMapPaint(
            activeMap,
            [pointToIndex(point, activeMap)],
            resolvePaintBrushForInput(event.button),
            mirrorState,
          )
        : paintMapCells(
            activeMap,
            [pointToIndex(point, activeMap)],
            resolvePaintBrushForInput(event.button),
          );
      setPastePreviewActive(false);
      setTransientMap(previewMap);
      setDragState({
        tool: "brush",
        pointerId: event.pointerId,
        lastPoint: point,
        previewMap,
        brush: resolvePaintBrushForInput(event.button),
      });
    },
    [
      activeMap,
      assignEyedropperBrush,
      boardRect,
      boardStatus.boardPan,
      canMutateBoard,
      clipboard,
      commitMapChange,
      commitPastePreview,
      hasActiveMirrors,
      map,
      mirrorState,
      pastePreviewActive,
      resolveBoardCellAtClientPoint,
      resolvePaintBrushForInput,
      replaceMapChangeLive,
      selection,
      selectionMode,
      textBrushRaster,
      tool,
      updateHoverAtClientPoint,
      beginBoardPanGesture,
    ],
  );

  const onBoardPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activeMap || !boardRect) return;
      if (event.altKey !== isAltPressed) setIsAltPressed(event.altKey);
      if (event.shiftKey !== isShiftPressed) setIsShiftPressed(event.shiftKey);

      const panState = dragPanRef.current;
      if (panState && panState.pointerId === event.pointerId) {
        const nextPan = clampBoardPan({
          boardPixelWidth,
          boardPixelHeight,
          boardPan: {
            x: panState.originPan.x + (event.clientX - panState.startClientX),
            y: panState.originPan.y + (event.clientY - panState.startClientY),
          },
          boardZoom: boardStatus.boardZoom,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
        });

        boardStatusStoreRef.current.update({
          boardPan: nextPan,
          hoverPoint: null,
          hoverCellSummary: null,
          isPanning: true,
        });
        setHoverCursorPoint(null);
        return;
      }

      const point = resolveBoardCellAtClientPoint(event.clientX, event.clientY);

      if (dragState?.pointerId === event.pointerId) {
        if (dragState.tool === "brush") {
          if (!point) return;
          if (point.x === dragState.lastPoint.x && point.y === dragState.lastPoint.y) return;

          const nextPreviewMap = hasActiveMirrors
            ? applyMirroredMapLine(
                dragState.previewMap,
                dragState.lastPoint,
                point,
                dragState.brush,
                mirrorState,
              )
            : paintMapLine(dragState.previewMap, dragState.lastPoint, point, dragState.brush);

          setTransientMap(nextPreviewMap);
          setDragState({
            ...dragState,
            lastPoint: point,
            previewMap: nextPreviewMap,
          });
          boardStatusStoreRef.current.update({
            hoverPoint: point,
            hoverCellSummary: buildHoverCellSummary(nextPreviewMap, point),
          });
          return;
        }

        if (dragState.tool === "line") {
          if (!point) return;
          if (point.x === dragState.current.x && point.y === dragState.current.y) return;

          setDragState({
            ...dragState,
            current: point,
          });
          boardStatusStoreRef.current.update({
            hoverPoint: point,
            hoverCellSummary: buildHoverCellSummary(activeMap, point),
          });
          return;
        }

        if (dragState.tool === "select") {
          if (!point) return;
          if (point.x === dragState.current.x && point.y === dragState.current.y) return;

          setDragState({
            ...dragState,
            current: point,
          });
          boardStatusStoreRef.current.update({
            hoverPoint: point,
            hoverCellSummary: buildHoverCellSummary(activeMap, point),
          });
          return;
        }

        if (dragState.tool === "move-selection") {
          if (!point) return;
          const nextAnchor = clampPoint(
            {
              x: point.x - dragState.grabOffset.x,
              y: point.y - dragState.grabOffset.y,
            },
            activeMap,
          );
          const nextPreviewMap = pasteMapRegion(dragState.baseMap, nextAnchor, dragState.clipboard);
          if (
            nextAnchor.x === dragState.currentAnchor.x &&
            nextAnchor.y === dragState.currentAnchor.y
          ) {
            boardStatusStoreRef.current.update({
              hoverPoint: point,
              hoverCellSummary: buildHoverCellSummary(nextPreviewMap, point),
            });
            return;
          }
          setDragState({
            ...dragState,
            currentAnchor: nextAnchor,
          });
          boardStatusStoreRef.current.update({
            hoverPoint: point,
            hoverCellSummary: buildHoverCellSummary(nextPreviewMap, point),
          });
          return;
        }

        if (dragState.tool === "wire") {
          if (!point) return;
          if (point.x === dragState.lastPoint.x && point.y === dragState.lastPoint.y) return;
          const cell = activeMap.tiles[pointToIndex(point, activeMap)];
          if (!cell || !canPlaceWireOnCell(cell)) return;

          let nextPreviewMap = dragState.previewMap;
          const linePoints = getLineIndices(dragState.lastPoint, point, activeMap).map((index) =>
            indexToPoint(index, activeMap),
          );
          for (let index = 1; index < linePoints.length; index += 1) {
            nextPreviewMap =
              dragState.mode === "add"
                ? connectWirePoints(nextPreviewMap, linePoints[index - 1]!, linePoints[index]!)
                : disconnectWirePoints(nextPreviewMap, linePoints[index - 1]!, linePoints[index]!);
          }
          if (dragState.mode === "add") {
            nextPreviewMap = placeWireNode(nextPreviewMap, point);
          }

          setPendingWirePoint(point);
          replaceMapChangeLive(nextPreviewMap);
          setTransientMap(nextPreviewMap);
          setDragState({
            ...dragState,
            lastPoint: point,
            previewMap: nextPreviewMap,
          });
          boardStatusStoreRef.current.update({
            hoverPoint: point,
            hoverCellSummary: buildHoverCellSummary(nextPreviewMap, point),
          });
          return;
        }
      }

      updateHoverAtClientPoint(event.clientX, event.clientY);
    },
    [
      activeMap,
      boardPixelHeight,
      boardPixelWidth,
      boardRect,
      boardStatus.boardZoom,
      dragState,
      hasActiveMirrors,
      isAltPressed,
      isShiftPressed,
      mirrorState,
      replaceMapChangeLive,
      resolveBoardCellAtClientPoint,
      updateHoverAtClientPoint,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  const onBoardPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const panState = dragPanRef.current;
      if (panState?.pointerId === event.pointerId) {
        dragPanRef.current = null;
        boardStatusStoreRef.current.update({
          isPanning: false,
        });
        updateHoverAtClientPoint(event.clientX, event.clientY);
        return;
      }

      const point = resolveBoardCellAtClientPoint(event.clientX, event.clientY);

      if (dragState?.pointerId === event.pointerId) {
        if (dragState.tool === "brush") {
          commitMapChange(dragState.previewMap);
          setTransientMap(null);
          setDragState(null);
          if (point) {
            boardStatusStoreRef.current.update({
              hoverPoint: point,
              hoverCellSummary: buildHoverCellSummary(map, point),
            });
          }
          return;
        }

        if (dragState.tool === "line") {
          if (map && canMutateBoard) {
            commitMapChange(
              hasActiveMirrors
                ? applyMirroredMapLine(
                    map,
                    dragState.start,
                    point ?? dragState.current,
                    dragState.brush,
                    mirrorState,
                  )
                : paintMapLine(map, dragState.start, point ?? dragState.current, dragState.brush),
            );
          }
          setDragState(null);
          updateHoverAtClientPoint(event.clientX, event.clientY);
          return;
        }

        if (dragState.tool === "wire") {
          if (doc && dragState.previewMap !== dragState.baseMap) {
            commitDocumentChange({
              ...doc,
              map: dragState.previewMap,
            });
          }
          setTransientMap(null);
          setPendingWirePoint(dragState.mode === "add" ? (point ?? dragState.lastPoint) : null);
          setDragState(null);
          updateHoverAtClientPoint(event.clientX, event.clientY);
          return;
        }

        if (dragState.tool === "select") {
          if (activeMap) {
            const nextSelectionRect = createSelectionFromRect(
              normalizeRect(dragState.start, point ?? dragState.current, activeMap),
            );
            setSelection(
              applySelectionOperation(
                selection,
                resolveSelectionIndices(nextSelectionRect, activeMap),
                activeMap,
                dragState.operation,
                dragState.mode,
              ),
            );
          }
          setDragState(null);
          setPastePreviewActive(false);
          updateHoverAtClientPoint(event.clientX, event.clientY);
          return;
        }

        if (dragState.tool === "move-selection") {
          const nextSelection = buildMovedSelection(
            activeMap ?? map ?? dragState.baseMap,
            dragState.currentAnchor,
            dragState.clipboard,
            dragState.selectionMode,
          );
          setSelectionPreview({
            baseMap: dragState.baseMap,
            clipboard: dragState.clipboard,
            selectionMode: dragState.selectionMode,
            anchor: dragState.currentAnchor,
          });
          setSelection(nextSelection);
          setPastePreviewActive(false);
          setSelectionTransformMenu(null);
          updateHoverAtClientPoint(event.clientX, event.clientY);
          setDragState(null);
          return;
        }
      }

      updateHoverAtClientPoint(event.clientX, event.clientY);
    },
    [
      activeMap,
      canMutateBoard,
      commitMapChange,
      commitDocumentChange,
      doc,
      dragState,
      hasActiveMirrors,
      map,
      mirrorState,
      resolveBoardCellAtClientPoint,
      resolveBoardCellSpacePointAtClientPoint,
      selection,
      updateHoverAtClientPoint,
    ],
  );

  const onBoardPointerCancel = useCallback(() => {
    dragPanRef.current = null;
    if (dragState?.tool === "wire") {
      replaceMapChangeLive(dragState.baseMap);
    }
    setDragState(null);
    setTransientMap(null);
    setPendingWirePoint(null);
    boardStatusStoreRef.current.update({
      isPanning: false,
      hoverPoint: null,
      hoverCellSummary: null,
    });
    setHoverCursorPoint(null);
  }, [dragState, replaceMapChangeLive]);

  const onBoardPointerLeave = useCallback(() => {
    if (dragPanRef.current || dragState) return;

    boardStatusStoreRef.current.update({
      hoverPoint: null,
      hoverCellSummary: null,
    });
    setHoverCursorPoint(null);
  }, [dragState]);

  const onBoardContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!activeMap || !selection || tool !== "select" || dragState || pastePreviewActive) {
        setSelectionTransformMenu(null);
        return;
      }

      const point = resolveBoardCellAtClientPoint(event.clientX, event.clientY);
      if (!point) {
        setSelectionTransformMenu(null);
        return;
      }

      const selectedIndices = new Set(resolveSelectionIndices(selection, activeMap));
      if (!selectedIndices.has(pointToIndex(point, activeMap))) {
        setSelectionTransformMenu(null);
        return;
      }

      setSelectionTransformMenu({
        x: event.clientX,
        y: event.clientY,
      });
    },
    [activeMap, dragState, pastePreviewActive, resolveBoardCellAtClientPoint, selection, tool],
  );

  const onBoardWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!activeMap || !boardRect) return;

      event.preventDefault();

      const viewport = boardViewportRef.current;
      if (!viewport) return;

      const viewportRect = viewport.getBoundingClientRect();
      const boardPoint = viewportClientPointToBoardPoint(
        viewportRect,
        { clientX: event.clientX, clientY: event.clientY },
        boardRect,
        boardPixelWidth,
        boardPixelHeight,
      );

      const nextZoom = clampZoom(
        event.deltaY < 0 ? boardStatus.boardZoom * ZOOM_STEP : boardStatus.boardZoom / ZOOM_STEP,
      );
      if (nextZoom === boardStatus.boardZoom) return;

      const viewportWidth = viewportSize.width || viewportRect.width;
      const viewportHeight = viewportSize.height || viewportRect.height;

      if (!boardPoint) {
        const nextPan = clampBoardPan({
          boardPixelWidth,
          boardPixelHeight,
          boardPan: boardStatus.boardPan,
          boardZoom: nextZoom,
          viewportWidth,
          viewportHeight,
        });

        boardStatusStoreRef.current.update({
          boardZoom: nextZoom,
          boardPan: nextPan,
        });
        return;
      }

      const localX = event.clientX - viewportRect.left;
      const localY = event.clientY - viewportRect.top;
      const centeredX = (viewportWidth - boardPixelWidth * nextZoom) / 2;
      const centeredY = (viewportHeight - boardPixelHeight * nextZoom) / 2;

      boardStatusStoreRef.current.update({
        boardZoom: nextZoom,
        boardPan: clampBoardPan({
          boardPixelWidth,
          boardPixelHeight,
          boardPan: {
            x: localX - centeredX - boardPoint.x * nextZoom,
            y: localY - centeredY - boardPoint.y * nextZoom,
          },
          boardZoom: nextZoom,
          viewportWidth,
          viewportHeight,
        }),
      });
      updateHoverAtClientPoint(event.clientX, event.clientY);
    },
    [
      activeMap,
      boardPixelHeight,
      boardPixelWidth,
      boardRect,
      boardStatus.boardPan,
      boardStatus.boardZoom,
      updateHoverAtClientPoint,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  const documentMetadataPanel =
    doc && metadataDraft ? (
      <>
        <div className="leftPanelSubsection">
          <div className="leftPanelSubsectionHeader">
            <div className="sectionEyebrow">Metadata</div>
          </div>

          {visualEditLockReason ? (
            <div className="panelSubtext mutedPanelNotice">{visualEditLockReason}</div>
          ) : null}
          {metadataError ? (
            <div className="panelInlineError documentInlineError">{metadataError}</div>
          ) : null}

          <fieldset className="plainFieldset" disabled={!canMutateBoard}>
            <div className="formGrid">
              <label className="fieldGroup">
                <span className="fieldCaption">Title</span>
                <input
                  className="textField compactField"
                  type="text"
                  value={metadataDraft.title}
                  onChange={(event) => updateMetadataDraftField("title", event.target.value)}
                />
              </label>

              <label className="fieldGroup">
                <span className="fieldCaption">Author</span>
                <input
                  className="textField compactField"
                  type="text"
                  value={metadataDraft.author}
                  onChange={(event) => updateMetadataDraftField("author", event.target.value)}
                />
              </label>

              <label className="fieldGroup">
                <span className="fieldCaption">Time</span>
                <input
                  className="textField compactField"
                  type="number"
                  min={0}
                  max={65535}
                  value={metadataDraft.time}
                  onChange={(event) => updateMetadataDraftField("time", event.target.value)}
                />
              </label>
            </div>

            <label className="fieldGroup">
              <span className="fieldCaption">Clue</span>
              <textarea
                className="textField inspectorTextArea"
                rows={3}
                value={metadataDraft.clue}
                onChange={(event) => updateMetadataDraftField("clue", event.target.value)}
              />
            </label>

            <label className="fieldGroup">
              <span className="fieldCaption">Note</span>
              <textarea
                className="textField inspectorTextArea"
                rows={4}
                value={metadataDraft.note}
                onChange={(event) => updateMetadataDraftField("note", event.target.value)}
              />
            </label>
          </fieldset>
        </div>

        <details className="leftPanelSubsection advancedDisclosure">
          <summary className="advancedDisclosureSummary">
            <span className="sectionEyebrow">Advanced</span>
          </summary>

          <div className="advancedDisclosureBody">
            <fieldset className="plainFieldset" disabled={!canMutateBoard}>
              <div className="formGrid singleColumnFormGrid">
                <label className="fieldGroup">
                  <span className="fieldCaption">Read-only Option</span>
                  <select
                    className="textField compactField"
                    value={metadataDraft.readOnlyOption}
                    onChange={(event) =>
                      updateMetadataDraftField("readOnlyOption", event.target.value)
                    }
                  >
                    {readOnlyOptionChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="fieldGroup">
                  <span className="fieldCaption">Hide Logic</span>
                  <select
                    className="textField compactField"
                    value={metadataDraft.hideLogic}
                    onChange={(event) => updateMetadataDraftField("hideLogic", event.target.value)}
                  >
                    {hideLogicChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="fieldGroup">
                  <span className="fieldCaption">CC1 Boots</span>
                  <select
                    className="textField compactField"
                    value={metadataDraft.cc1Boots}
                    onChange={(event) => updateMetadataDraftField("cc1Boots", event.target.value)}
                  >
                    {cc1BootsChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="fieldGroup">
                  <span className="fieldCaption">Blob Behavior</span>
                  <select
                    className="textField compactField"
                    value={metadataDraft.blobPatterns}
                    onChange={(event) =>
                      updateMetadataDraftField("blobPatterns", event.target.value)
                    }
                  >
                    {blobPatternChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="formGrid">
                <label className="fieldGroup">
                  <span className="fieldCaption">File Version</span>
                  <select
                    className="textField compactField"
                    value={metadataDraft.fileVersion}
                    onChange={(event) =>
                      updateMetadataDraftField("fileVersion", event.target.value)
                    }
                  >
                    {fileVersionChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="fieldGroup">
                  <span className="fieldCaption">Editor Window</span>
                  <select
                    className="textField compactField"
                    value={metadataDraft.editorWindow}
                    onChange={(event) =>
                      updateMetadataDraftField("editorWindow", event.target.value)
                    }
                  >
                    {editorWindowChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="fieldGroup">
                  <span className="fieldCaption">Verified Replay</span>
                  <select
                    className="textField compactField"
                    value={metadataDraft.verifiedReplay}
                    onChange={(event) =>
                      updateMetadataDraftField("verifiedReplay", event.target.value)
                    }
                  >
                    {verifiedReplayChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="fieldGroup">
                  <span className="fieldCaption">Hide Map</span>
                  <select
                    className="textField compactField"
                    value={metadataDraft.hideMap}
                    onChange={(event) => updateMetadataDraftField("hideMap", event.target.value)}
                  >
                    {hideMapChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="fieldGroup">
                  <span className="fieldCaption">Editor Version</span>
                  <input
                    className="textField compactField"
                    type="text"
                    value={metadataDraft.editorVersion}
                    onChange={(event) =>
                      updateMetadataDraftField("editorVersion", event.target.value)
                    }
                  />
                </label>

                <label className="fieldGroup">
                  <span className="fieldCaption">Lock</span>
                  <input
                    className="textField compactField"
                    type="text"
                    value={metadataDraft.lock}
                    onChange={(event) => updateMetadataDraftField("lock", event.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            <div className="stackedInfo">
              <div className="inspectorLayerRow">
                <span className="inspectorLayerLabel">Warnings</span>
                <span className="inspectorLayerValue">{warnings.length}</span>
              </div>
              <div className="inspectorLayerRow">
                <span className="inspectorLayerLabel">Raw Sections</span>
                <span className="inspectorLayerValue">{preservedSectionTags.length}</span>
              </div>
              <div className="inspectorLayerRow">
                <span className="inspectorLayerLabel">Extra Chunks</span>
                <span className="inspectorLayerValue">{preservedExtraChunkTags.length}</span>
              </div>
            </div>

            {warnings.length > 0 ? (
              <label className="fieldGroup">
                <span className="fieldCaption">Warning Messages</span>
                <textarea
                  className="textField inspectorTextArea codeArea"
                  readOnly
                  rows={Math.min(6, Math.max(2, warnings.length))}
                  value={warnings.join("\n")}
                />
              </label>
            ) : null}

            {preservedSectionTags.length > 0 ? (
              <label className="fieldGroup">
                <span className="fieldCaption">Section Tags</span>
                <textarea
                  className="textField inspectorTextArea codeArea"
                  readOnly
                  rows={Math.min(4, Math.max(2, preservedSectionTags.length))}
                  value={preservedSectionTags.join(" ")}
                />
              </label>
            ) : null}

            {preservedExtraChunkTags.length > 0 ? (
              <label className="fieldGroup">
                <span className="fieldCaption">Extra Chunk Tags</span>
                <textarea
                  className="textField inspectorTextArea codeArea"
                  readOnly
                  rows={Math.min(4, Math.max(2, preservedExtraChunkTags.length))}
                  value={preservedExtraChunkTags.join(" ")}
                />
              </label>
            ) : null}
          </div>
        </details>
      </>
    ) : (
      <div className="leftPanelSubsection">
        <div className="emptyPanelState">Open or create a document to edit metadata.</div>
      </div>
    );

  const documentResizePanel =
    map && resizeDraft ? (
      <div className="leftPanelSubsection">
        <div className="leftPanelSubsectionHeader">
          <div className="sectionEyebrow">Resize Map</div>
          <div className="sectionActions">
            <button
              type="button"
              className="secondaryButton"
              onClick={() => setResizeDraft(makeMapResizeDraft(map))}
              disabled={!resizeDirty}
            >
              Reset
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => applyResizeDraftChanges()}
              disabled={!resizeDirty || !canMutateBoard}
            >
              Apply Resize
            </button>
          </div>
        </div>

        {visualEditLockReason ? (
          <div className="panelSubtext mutedPanelNotice">{visualEditLockReason}</div>
        ) : null}
        {resizeError ? (
          <div className="panelInlineError documentInlineError">{resizeError}</div>
        ) : null}

        <fieldset className="plainFieldset" disabled={!canMutateBoard}>
          <div className="formGrid">
            <label className="fieldGroup">
              <span className="fieldCaption">Width</span>
              <input
                className="textField compactField"
                type="number"
                min={MIN_C2M_MAP_SIZE}
                max={MAX_C2M_MAP_SIZE}
                value={resizeDraft.width}
                onChange={(event) => updateResizeDraftField("width", event.target.value)}
              />
            </label>

            <label className="fieldGroup">
              <span className="fieldCaption">Height</span>
              <input
                className="textField compactField"
                type="number"
                min={MIN_C2M_MAP_SIZE}
                max={MAX_C2M_MAP_SIZE}
                value={resizeDraft.height}
                onChange={(event) => updateResizeDraftField("height", event.target.value)}
              />
            </label>
          </div>

          <div className="panelSubtext">
            New cells are filled with `FLOOR`. Resizing is constrained to `10x10` through `100x100`.
          </div>
        </fieldset>
      </div>
    ) : (
      <div className="leftPanelSubsection">
        <div className="emptyPanelState">Open a level to resize its map.</div>
      </div>
    );

  return (
    <div
      className="appShell"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      {isDragOver ? (
        <div className="banner updateBanner">
          Drop a `.c2m` or `.json` file anywhere to open it.
        </div>
      ) : null}
      {tilesetError ? <div className="banner subtleErrorBanner">{tilesetError}</div> : null}
      {parseError ? <div className="banner errorBanner">{parseError}</div> : null}
      {error ? <div className="banner errorBanner">{error}</div> : null}
      {renderError ? <div className="banner errorBanner">{renderError}</div> : null}
      {warnings.map((warning, index) => (
        <div key={index} className="banner updateBanner">
          {warning}
        </div>
      ))}

      {ideasDialogOpen === "browse-walls" ? (
        <BrowseWallsDialog
          records={wallsBankRecords}
          loadState={wallsBankLoadState}
          errorMessage={wallsBankErrorMessage}
          starredKeys={wallsStarredKeys}
          hiddenKeys={wallsHiddenKeys}
          onToggleStar={toggleWallsStar}
          onToggleHidden={toggleWallsHidden}
          onImport={importBankWallLayout}
          onClose={() => setIdeasDialogOpen(null)}
        />
      ) : null}

      {ideasDialogOpen === "generate-walls" ? (
        <GenerateWallsDialog
          starredRecords={generatedWallStarredRecords}
          onToggleStar={toggleGeneratedWallStar}
          onImport={importGeneratedWallLayout}
          onClose={() => setIdeasDialogOpen(null)}
          sizeLimits={generateWallsSizeLimits}
          frameToMask={false}
        />
      ) : null}

      {c2gEditorOpen ? (
        <div
          className="modalBackdrop"
          onPointerDown={() => setC2gEditorOpen(false)}
          role="presentation"
        >
          <section
            className="modalCard modalCardWide c2gEditorModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-c2g-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <div className="sectionEyebrow">Level Set</div>
                <h2 id="edit-c2g-title" className="modalTitle">
                  Edit C2G
                </h2>
                <div className="panelSubtext">
                  Only `game` and `map` lines affect editor state. Other directives are preserved
                  verbatim.
                </div>
              </div>
              <button
                type="button"
                className="modalCloseButton"
                aria-label="Close edit C2G modal"
                onClick={() => setC2gEditorOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="modalBody c2gEditorModalBody">
              <label className="fieldGroup">
                <span className="fieldCaption">Raw {levelset?.c2gFileName ?? "set.c2g"}</span>
                <textarea
                  className="textField inspectorTextArea codeArea c2gEditorTextArea"
                  spellCheck={false}
                  value={c2gDraftText}
                  onChange={(event) => {
                    setC2gDraftText(event.target.value);
                    if (c2gDraftError) setC2gDraftError(null);
                  }}
                />
              </label>

              {c2gDraftError ? (
                <div className="panelInlineError documentInlineError">{c2gDraftError}</div>
              ) : null}
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setC2gEditorOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="actionButton" onClick={saveC2gDraft}>
                Save C2G
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {recentModalOpen ? (
        <div
          className="modalBackdrop"
          onPointerDown={() => setRecentModalOpen(false)}
          role="presentation"
        >
          <section
            className="modalCard recentLevelsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-recent-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="sectionHeader">
              <div>
                <div className="sectionEyebrow">File</div>
                <h2 id="open-recent-title" className="sectionTitle">
                  Open Recent
                </h2>
              </div>
              <div className="sectionActions">
                {recentSets.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => scrollRecentCarousel(-1)}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => scrollRecentCarousel(1)}
                    >
                      Next
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setRecentModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            {recentSets.length === 0 ? (
              <div className="emptyState largeEmptyState">
                Recent sets will appear here after you create, open, or edit a set.
              </div>
            ) : (
              <div ref={recentCarouselRef} className="recentLevelsCarousel">
                {recentSets.map((entry) => (
                  <article key={entry.id} className="recentLevelCard">
                    <button
                      type="button"
                      className="recentLevelPreviewButton"
                      onClick={() => openRecentSet(entry)}
                    >
                      {entry.thumbnailDataUrl ? (
                        <img
                          className="recentLevelImage"
                          src={entry.thumbnailDataUrl}
                          alt={`${entry.title} preview`}
                        />
                      ) : (
                        <div className="recentLevelImagePlaceholder">
                          <span>
                            {entry.width && entry.height
                              ? `${entry.width}x${entry.height}`
                              : "No map"}
                          </span>
                        </div>
                      )}
                    </button>
                    <div className="recentLevelBody">
                      <div className="recentLevelTitle">{entry.title}</div>
                      <div className="recentLevelMeta">{entry.fileName}</div>
                      <div className="recentLevelMeta">
                        {`${entry.levelCount} ${entry.levelCount === 1 ? "level" : "levels"}`} ·{" "}
                        {entry.selectedLevelTitle}
                      </div>
                      <div className="recentLevelMeta">
                        {entry.width && entry.height ? `${entry.width}x${entry.height}` : "No map"}{" "}
                        · {formatRecentLevelUpdatedAt(entry.updatedAt)}
                      </div>
                    </div>
                    <div className="boardControlRow boardCommandRow recentLevelActions">
                      <button
                        type="button"
                        className="actionButton"
                        onClick={() => openRecentSet(entry)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="secondaryButton"
                        onClick={() => deleteRecentSet(entry.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      <main className="editorLayout" ref={editorLayoutRef} style={editorLayoutStyle}>
        <aside className="panel levelPanel">
          <section className="panelSection">
            <div className="panelBrand">
              <div className="panelBrandCopy">
                <div className="panelBrandHeader">
                  <div className="brandTitle">C2MTools Editor</div>
                </div>
                <div className="brandSubtitle">Level authoring for CC2 C2M files</div>
                <div className="panelMetaStrip">
                  <input
                    className="brandingFileInput"
                    type="text"
                    aria-label="Document filename"
                    value={displayFileName}
                    spellCheck={false}
                    onChange={(event) => setFileName(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="panelSection leftPanelMenuSection">
            <div className="boardMenuBar" ref={boardMenuBarRef}>
              <div
                className="menuWrap"
                ref={(node) => {
                  boardMenuWrapRefs.current.file = node;
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="menuButton"
                  aria-expanded={boardMenuOpen === "file"}
                  onClick={() => toggleBoardMenu("file")}
                >
                  File
                </button>
                {boardMenuOpen === "file" ? (
                  <div className="dropdownMenu" style={resolveBoardMenuDropdownStyle("file")}>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      onClick={() => {
                        setBoardMenuOpen(null);
                        onNewClick();
                      }}
                    >
                      New
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      onClick={() => {
                        setBoardMenuOpen(null);
                        onOpenClick();
                      }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      onClick={() => {
                        setBoardMenuOpen(null);
                        onOpenRecentClick();
                      }}
                    >
                      Open Recent
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={!canSaveLevel}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        onSaveLevel();
                      }}
                    >
                      Save Level
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={!canSaveSet}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        onSaveSet();
                      }}
                    >
                      Save Set
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={!jsonOk}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        onDownloadJson();
                      }}
                    >
                      Download JSON
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={!canTestInNotcc}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        onTestInNotcc();
                      }}
                    >
                      Test in NotCC (F5)
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                className="menuWrap"
                ref={(node) => {
                  boardMenuWrapRefs.current.view = node;
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="menuButton"
                  aria-expanded={boardMenuOpen === "view"}
                  onClick={() => toggleBoardMenu("view")}
                >
                  View
                </button>
                {boardMenuOpen === "view" ? (
                  <div className="dropdownMenu" style={resolveBoardMenuDropdownStyle("view")}>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={viewMode === "board"}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        setViewMode("board");
                      }}
                    >
                      Board Workspace
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={viewMode === "json"}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        setViewMode("json");
                      }}
                    >
                      Raw JSON Workspace
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={!activeMap}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        boardStatusStoreRef.current.reset();
                      }}
                    >
                      Reset Board View
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                className="menuWrap"
                ref={(node) => {
                  boardMenuWrapRefs.current.transform = node;
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="menuButton"
                  aria-expanded={boardMenuOpen === "transform"}
                  onClick={() => toggleBoardMenu("transform")}
                >
                  Transform
                </button>
                {boardMenuOpen === "transform" ? (
                  <div className="dropdownMenu" style={resolveBoardMenuDropdownStyle("transform")}>
                    {TRANSFORMS.map((transform) => (
                      <button
                        key={transform.op}
                        type="button"
                        className="dropdownMenuItem"
                        disabled={!doc || !jsonOk}
                        onClick={() => {
                          setBoardMenuOpen(null);
                          applyTransform(transform.op);
                        }}
                      >
                        {transform.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div
                className="menuWrap"
                ref={(node) => {
                  boardMenuWrapRefs.current.ideas = node;
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="menuButton"
                  aria-expanded={boardMenuOpen === "ideas"}
                  onClick={() => toggleBoardMenu("ideas")}
                >
                  Ideas
                </button>
                {boardMenuOpen === "ideas" ? (
                  <div className="dropdownMenu" style={resolveBoardMenuDropdownStyle("ideas")}>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={!map || !jsonOk}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        setIdeasDialogOpen("generate-walls");
                      }}
                    >
                      Generate Walls
                    </button>
                    <button
                      type="button"
                      className="dropdownMenuItem"
                      disabled={!map || !jsonOk}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        setIdeasDialogOpen("browse-walls");
                      }}
                    >
                      Browse Walls
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <div className="inspectorTabs levelPanelTabs" role="tablist" aria-label="Left panel tabs">
            <button
              type="button"
              role="tab"
              aria-selected={leftPanelTab === "levels"}
              className={`inspectorTab ${leftPanelTab === "levels" ? "active" : ""}`}
              onClick={() => setLeftPanelTab("levels")}
            >
              Levels
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftPanelTab === "controls"}
              className={`inspectorTab ${leftPanelTab === "controls" ? "active" : ""}`}
              onClick={() => setLeftPanelTab("controls")}
            >
              Controls
            </button>
          </div>

          {leftPanelTab === "levels" ? (
            <section className="panelSection leftPanelTabBody levelManagerSection">
              <div className="sectionHeader">
                <div className="levelManagerHeaderCopy">
                  <div className="sectionEyebrow">Levels Manager</div>
                  <h2 className="sectionTitle">{levelsetTitle}</h2>
                </div>
                <span className="statusBadge">{`${displayedLevelCount} levels`}</span>
              </div>

              <div className="boardControlRow boardCommandRow">
                <button type="button" className="actionButton" onClick={onNewClick}>
                  New
                </button>
                <button type="button" className="secondaryButton" onClick={onOpenClick}>
                  Open
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!canSaveLevel}
                  onClick={onSaveLevel}
                >
                  Save Level
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!canSaveSet}
                  onClick={onSaveSet}
                >
                  Save Set
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!levelset}
                  onClick={openC2gEditor}
                >
                  Edit C2G
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!jsonOk}
                  onClick={onDownloadJson}
                >
                  JSON
                </button>
              </div>

              <div className="levelManagerHint">
                Drag to reorder. Selecting a level switches the active board, JSON view, and save
                target.
              </div>

              <div className="boardControlRow boardCommandRow">
                <button
                  type="button"
                  className="actionButton"
                  onClick={addLevelAfterCurrentSelection}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={displayedLevelCount <= 0}
                  onClick={duplicateSelectedLevel}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!canDeleteSelectedLevel}
                  onClick={deleteSelectedLevel}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!canMoveDisplayedLevelUp}
                  onClick={() => moveDisplayedLevelBy(-1)}
                >
                  Move Up
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!canMoveDisplayedLevelDown}
                  onClick={() => moveDisplayedLevelBy(1)}
                >
                  Move Down
                </button>
              </div>

              {displayedLevelCount > 0 ? (
                <div
                  className="levelList"
                  role="list"
                  aria-label="Level list"
                  onDragOver={(event) => {
                    if (event.target !== event.currentTarget) return;
                    event.preventDefault();
                    const nextDropState = getLevelDropStateFromList(
                      event.currentTarget,
                      event.clientY,
                    );
                    if (!nextDropState) return;
                    setLevelDropState((current) =>
                      current?.index === nextDropState.index &&
                      current.position === nextDropState.position
                        ? current
                        : nextDropState,
                    );
                  }}
                  onDrop={(event) => {
                    if (event.target !== event.currentTarget) return;
                    event.preventDefault();
                    handleLevelDrop();
                  }}
                >
                  {levelset?.levels.map((entry, index) => {
                    const isSelected = index === selectedLevelIndex;
                    const showsDropBefore =
                      draggedLevelIndex !== null &&
                      levelDropState?.index === index &&
                      levelDropState.position === "before";
                    const showsDropAfter =
                      draggedLevelIndex !== null &&
                      levelDropState?.index === index &&
                      levelDropState.position === "after";

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        draggable
                        className={`levelListItem ${isSelected ? "selected" : ""} ${draggedLevelIndex === index ? "dragging" : ""} ${showsDropBefore ? "dropBefore" : ""} ${showsDropAfter ? "dropAfter" : ""}`}
                        onClick={() => selectLevelAt(index)}
                        onDragStart={() => handleLevelDragStart(index)}
                        onDragOver={(event) => {
                          event.stopPropagation();
                          handleLevelDragOver(event, index);
                        }}
                        onDrop={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          handleLevelDrop();
                        }}
                        onDragEnd={() => {
                          setDraggedLevelIndex(null);
                          setLevelDropState(null);
                        }}
                      >
                        <span className="levelDragGrip" aria-hidden="true">
                          ::
                        </span>
                        <span className="levelListNumber">
                          {String(index + 1).padStart(
                            Math.max(2, String(displayedLevelCount).length),
                            "0",
                          )}
                        </span>
                        <span className="levelListTitle">
                          {entry.doc.title?.trim() || `Level ${index + 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="emptyState">
                  Create a blank level or open an existing `.c2m`, `.json`, folder, or `.zip` set to
                  start editing.
                </div>
              )}
            </section>
          ) : null}

          {leftPanelTab === "controls" ? (
            <section className="panelSection leftPanelTabBody controlsPanelSection">
              <div className="sectionHeader">
                <div>
                  <div className="sectionEyebrow">Controls</div>
                  <h2 className="sectionTitle">Board Commands</h2>
                </div>
                <span className="statusBadge">{activeToolLabel}</span>
              </div>

              <div className="boardControlRow boardCommandRow">
                <button type="button" className="actionButton" onClick={onUndo} disabled={!canUndo}>
                  Undo
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={onRedo}
                  disabled={!canRedo}
                >
                  Redo
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={cutSelection}
                  disabled={!selection || !canMutateBoard}
                >
                  Cut
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={copySelection}
                  disabled={!selection}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={beginPastePreview}
                  disabled={!clipboard}
                >
                  Paste
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={eraseSelection}
                  disabled={!selection || !canMutateBoard}
                >
                  Erase
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={clearActiveMap}
                  disabled={!canMutateBoard || !map}
                >
                  Clear Map
                </button>
              </div>

              <div className="boardControlRow boardCommandRow">
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!activeMap}
                  onClick={() => setBoardZoom(boardStatus.boardZoom / ZOOM_STEP)}
                >
                  Zoom -
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!activeMap}
                  onClick={() => setBoardZoom(boardStatus.boardZoom * ZOOM_STEP)}
                >
                  Zoom +
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!activeMap}
                  onClick={() => boardStatusStoreRef.current.reset()}
                >
                  Reset View
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setViewMode(viewMode === "board" ? "json" : "board")}
                >
                  {viewMode === "board" ? "Raw JSON" : "Board"}
                </button>
              </div>

              <div className="boardHelpText">
                Left and right mouse buttons paint using the active palette slots. Hold `Alt` for a
                temporary eyedropper. Use `,` and `.` to rotate the shared palette direction,
                railroad pieces, and directional brushes, or cycle decorative wall colors, letter
                symbols, and logic counters when those brushes are selected. Press `R` for the wire
                tool. Middle mouse, `Cmd`/`Ctrl` plus drag, or dragging empty board space pans.
                Arrow keys and `WASD` also move the camera. Mouse wheel zooms the board. Press `F5`
                to test the current level in NotCC.
              </div>
            </section>
          ) : null}
        </aside>

        <div
          className={`panelSplitter ${layoutResizeState?.side === "left" ? "active" : ""}`}
          onPointerDown={(event) => beginLayoutResize(event, "left")}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left sidebar"
        />

        <section className="panel boardPanel">
          <section className="panelSection">
            <div className="sectionHeader">
              <div>
                <div className="sectionEyebrow">{viewMode === "board" ? "Board" : "Advanced"}</div>
                <h2 className="sectionTitle">
                  {viewMode === "board" ? documentTitle : "Raw JSON Workspace"}
                </h2>
              </div>
              {viewMode === "board" ? (
                <div className="sectionActions boardToolGroups">
                  <div className="toolButtonGroup toolButtonGroupSeparated">
                    <button
                      type="button"
                      className={`toolButton toolButtonSelectMode ${tool === "select" ? "active" : ""}`}
                      onClick={handleSelectToolButtonClick}
                      title={getSelectionModeLabel(selectionMode)}
                    >
                      <span className="toolButtonLabel">
                        {getSelectionModeLabel(selectionMode)}
                      </span>
                      <span className="toolModeBadge">{getSelectionModeBadge(selectionMode)}</span>
                      <span className="toolShortcut">V</span>
                    </button>
                  </div>
                  <div className="toolButtonGroup boardToolRow">
                    {TOOL_SHORTCUTS.filter((entry) => entry.id !== "select").map((entry) => {
                      const mutatesBoard =
                        entry.id === "brush" ||
                        entry.id === "text" ||
                        entry.id === "line" ||
                        entry.id === "fill" ||
                        entry.id === "erase" ||
                        entry.id === "wire";

                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={`toolButton ${tool === entry.id ? "active" : ""}`}
                          disabled={mutatesBoard && !canMutateBoard}
                          onClick={() => setTool(entry.id)}
                          title={`${entry.label} (${entry.shortcut})`}
                        >
                          <span>{entry.label}</span>
                          <span className="toolShortcut">{entry.shortcut}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="boardMeta">
              <span className="statusBadge">
                {activeMap ? `${activeMap.width}x${activeMap.height}` : "No map"}
              </span>
              <span className="statusBadge">{activeToolLabel}</span>
              <span className="statusBadge">{Math.round(boardStatus.boardZoom * 100)}%</span>
              {viewMode === "board" && hoverSummaryText ? (
                <span className="statusBadge">{hoverSummaryText}</span>
              ) : null}
              {selection ? (
                <span className="statusBadge">{`Selection ${selection.width}x${selection.height}`}</span>
              ) : null}
              {clipboard ? (
                <span className="statusBadge">{`Clipboard ${clipboard.width}x${clipboard.height}`}</span>
              ) : null}
            </div>

            {viewMode === "board" && tool === "text" ? (
              <div className="textBrushPanel">
                <div className="textBrushField textBrushFieldText">
                  <label className="fieldLabel" htmlFor="c2m-text-brush-text">
                    Text
                  </label>
                  <div className="textBrushTextareaWrap">
                    {showTextBrushPixelPreview && textBrushPreviewRaster ? (
                      <div
                        className="textBrushPreviewOverlay"
                        aria-hidden="true"
                        style={{
                          transform: `translate(${-textBrushPreviewScroll.left}px, ${-textBrushPreviewScroll.top}px)`,
                        }}
                      >
                        <svg
                          className="textBrushPreviewRaster"
                          width={textBrushPreviewRaster.width}
                          height={textBrushPreviewRaster.height}
                          viewBox={`0 0 ${textBrushPreviewRaster.width} ${textBrushPreviewRaster.height}`}
                        >
                          {textBrushSelectionRects.map((rect, index) => (
                            <rect
                              key={`selection-${index}`}
                              className="textBrushPreviewSelection"
                              x={rect.x}
                              y={rect.y}
                              width={rect.width}
                              height={rect.height}
                            />
                          ))}
                          {textBrushPreviewRaster.indices.map((index) => (
                            <rect
                              key={index}
                              className="textBrushPreviewPixel"
                              x={index % textBrushPreviewRaster.width}
                              y={Math.floor(index / textBrushPreviewRaster.width)}
                              width="1"
                              height="1"
                            />
                          ))}
                          {textBrushCaretRect ? (
                            <rect
                              className="textBrushPreviewCaret"
                              x={textBrushCaretRect.x}
                              y={textBrushCaretRect.y}
                              width="2"
                              height={textBrushCaretRect.height}
                            />
                          ) : null}
                        </svg>
                      </div>
                    ) : null}
                    <textarea
                      id="c2m-text-brush-text"
                      className={`textBrushTextarea ${showTextBrushPixelPreview ? "pixelPreviewActive" : ""}`}
                      spellCheck={false}
                      value={textBrushConfig.text}
                      style={{
                        fontFamily: textBrushConfig.fontFamily,
                        fontSize: `${textBrushPreviewFontSize}px`,
                        lineHeight: 1.1,
                        textAlign: textBrushConfig.align,
                      }}
                      onChange={(event) => {
                        setTextBrushText(event.target.value);
                        syncTextBrushSelection(event.currentTarget, true);
                      }}
                      onScroll={(event) =>
                        setTextBrushPreviewScroll({
                          left: event.currentTarget.scrollLeft,
                          top: event.currentTarget.scrollTop,
                        })
                      }
                      onSelect={(event) => syncTextBrushSelection(event.currentTarget, true)}
                      onFocus={(event) => syncTextBrushSelection(event.currentTarget, true)}
                      onBlur={(event) => syncTextBrushSelection(event.currentTarget, false)}
                    />
                  </div>
                </div>
                <div className="textBrushField">
                  <label className="fieldLabel" htmlFor="c2m-text-brush-font">
                    Font
                  </label>
                  <select
                    id="c2m-text-brush-font"
                    value={textBrushConfig.fontFamily}
                    onChange={(event) => {
                      const nextFamily = event.target.value;
                      setTextBrushFontFamily(nextFamily);
                      setTextBrushFontSize(
                        normalizeTextBrushFontSize(nextFamily, textBrushConfig.fontSize),
                      );
                    }}
                  >
                    {TEXT_BRUSH_FONT_CHOICES.map((option) => (
                      <option key={option.family} value={option.family}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="textBrushField textBrushFieldSize">
                  <label className="fieldLabel" htmlFor="c2m-text-brush-size">
                    Size
                  </label>
                  <select
                    id="c2m-text-brush-size"
                    value={String(textBrushConfig.fontSize)}
                    onChange={(event) => setTextBrushFontSize(Number(event.target.value))}
                  >
                    {textBrushSizeChoices.map((size) => (
                      <option key={size} value={String(size)}>
                        {formatTextBrushFontSizeLabel(textBrushConfig.fontFamily, size)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="textBrushField textBrushFieldAlign">
                  <label className="fieldLabel" htmlFor="c2m-text-brush-align">
                    Align
                  </label>
                  <select
                    id="c2m-text-brush-align"
                    value={textBrushConfig.align}
                    onChange={(event) => setTextBrushAlign(event.target.value as TextBrushAlign)}
                  >
                    {TEXT_BRUSH_ALIGN_CHOICES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {viewMode === "json" ? (
              <div className="hoverSummary">
                Invalid raw JSON edits stay local until they parse successfully again.
              </div>
            ) : null}
          </section>

          {visualEditLockReason && doc && viewMode === "board" ? (
            <div className="banner subtleErrorBanner panelBanner">{visualEditLockReason}</div>
          ) : null}

          {viewMode === "json" ? (
            <div className="jsonWorkspaceBody">
              <textarea
                spellCheck={false}
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                placeholder="JSON will appear here after you open or create a level…"
              />
            </div>
          ) : (
            <>
              <div
                ref={boardViewportRef}
                className={`boardViewport ${boardStatus.isPanning ? "panning" : ""}`}
                style={boardCanvasCursor ? { cursor: boardCanvasCursor } : undefined}
                onContextMenu={onBoardContextMenu}
                onPointerDown={onBoardPointerDown}
                onPointerMove={onBoardPointerMove}
                onPointerUp={onBoardPointerUp}
                onPointerCancel={onBoardPointerCancel}
                onPointerLeave={onBoardPointerLeave}
                onWheel={onBoardWheel}
              >
                {!activeMap ? (
                  <div className="emptyState largeEmptyState">
                    {doc
                      ? "This document has no decoded map payload. Use the raw JSON workspace for manual inspection."
                      : "Create or open a `.c2m` file to start editing the board."}
                  </div>
                ) : (
                  <>
                    {boardRect ? (
                      <div
                        className="boardChromeFrame"
                        style={{
                          left: boardRect.x,
                          top: boardRect.y,
                          width: boardRect.width,
                          height: boardRect.height,
                        }}
                      >
                        {BOARD_TRANSFORM_BUTTONS.map((button) => (
                          <button
                            key={button.op}
                            type="button"
                            className={`boardTransformButton ${button.position}`}
                            aria-label={button.label}
                            title={button.label}
                            disabled={!doc || !jsonOk}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => applyTransform(button.op)}
                          >
                            {renderBoardTransformIcon(button.op)}
                          </button>
                        ))}
                        {BOARD_MIRROR_BUTTONS.map((button) => {
                          const mirror = mirrorState[button.kind];
                          const anchor = resolveMirrorHandleAnchor(mirror, mirrorBoardSize);
                          if (!anchor) return null;

                          return (
                            <button
                              key={button.kind}
                              type="button"
                              className={`boardMirrorButton ${mirror.active ? "active" : ""}`}
                              aria-label={button.label}
                              title={`${mirror.active ? "Disable" : "Enable"} mirror`}
                              style={{
                                left: `${(anchor.point.x / Math.max(1, mirrorBoardSize.width)) * 100}%`,
                                top: `${(anchor.point.y / Math.max(1, mirrorBoardSize.height)) * 100}%`,
                                transform: resolveMirrorButtonTransform(button.kind, anchor.edge),
                              }}
                              onPointerDown={(event) => beginMirrorDrag(button.kind, event)}
                            >
                              Mirror
                            </button>
                          );
                        })}
                        {LEVEL_EDGE_CONTROLS.map((control) => (
                          <div
                            key={control.direction}
                            className={`boardEdgeControlGroup ${control.direction}`}
                          >
                            <button
                              type="button"
                              className="boardEdgeButton boardResizeEdgeButton"
                              aria-label={control.shrinkLabel}
                              title={control.shrinkLabel}
                              disabled={
                                !canMutateBoard || !map || !canResizeMapEdge(map, control.edge, -1)
                              }
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => resizeActiveMapEdge(control.edge, -1)}
                            >
                              -
                            </button>
                            <button
                              type="button"
                              className={`boardEdgeButton boardWrapEdgeButton ${control.direction}`}
                              aria-label={control.wrapLabel}
                              title={control.wrapLabel}
                              disabled={!canMutateBoard}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => shiftActiveMapWrap(control.dx, control.dy)}
                            >
                              <svg viewBox="0 0 16 16" aria-hidden="true">
                                <polygon points="8,3 13,12 3,12" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="boardEdgeButton boardResizeEdgeButton"
                              aria-label={control.growLabel}
                              title={control.growLabel}
                              disabled={
                                !canMutateBoard || !map || !canResizeMapEdge(map, control.edge, 1)
                              }
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => resizeActiveMapEdge(control.edge, 1)}
                            >
                              +
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <canvas
                      ref={boardCanvasRef}
                      className="boardCanvas"
                      style={
                        boardRect
                          ? {
                              left: boardRect.x,
                              top: boardRect.y,
                              width: boardRect.width,
                              height: boardRect.height,
                              ...(boardCanvasCursor ? { cursor: boardCanvasCursor } : {}),
                            }
                          : undefined
                      }
                    />

                    {boardRect ? (
                      <svg className="boardOverlaySvg" aria-hidden="true">
                        {mirrorLineSegments.map((segment, index) => (
                          <line
                            key={`mirror-${index}`}
                            x1={
                              boardRect.x +
                              (segment.start.x / mirrorBoardSize.width) * boardRect.width
                            }
                            y1={
                              boardRect.y +
                              (segment.start.y / mirrorBoardSize.height) * boardRect.height
                            }
                            x2={
                              boardRect.x +
                              (segment.end.x / mirrorBoardSize.width) * boardRect.width
                            }
                            y2={
                              boardRect.y +
                              (segment.end.y / mirrorBoardSize.height) * boardRect.height
                            }
                            className="boardMirrorLine"
                          />
                        ))}
                        {linePreviewIndices.map((index) => {
                          const cellPoint = {
                            x: index % activeMap.width,
                            y: Math.floor(index / activeMap.width),
                          };
                          const rect = resolveBoardCellScreenRect(cellPoint, activeMap, boardRect);

                          return (
                            <rect
                              key={`line-${index}`}
                              x={rect.x}
                              y={rect.y}
                              width={rect.width}
                              height={rect.height}
                              fill="rgba(35, 95, 122, 0.16)"
                              stroke="rgba(35, 95, 122, 0.78)"
                              strokeWidth={Math.max(1.2, rect.width / 10)}
                            />
                          );
                        })}

                        {selectionPreviewRect
                          ? selectionPreviewRect.indices
                            ? resolveSelectionIndices(selectionPreviewRect, activeMap).map(
                                (index) => {
                                  const cellPoint = indexToPoint(index, activeMap);
                                  const rect = resolveBoardCellScreenRect(
                                    cellPoint,
                                    activeMap,
                                    boardRect,
                                  );
                                  return (
                                    <rect
                                      key={`selection-${index}`}
                                      x={rect.x}
                                      y={rect.y}
                                      width={rect.width}
                                      height={rect.height}
                                      fill="rgba(216, 165, 77, 0.12)"
                                      stroke="rgba(216, 165, 77, 0.9)"
                                      strokeWidth={Math.max(1.2, rect.width / 10)}
                                    />
                                  );
                                },
                              )
                            : (() => {
                                const rect = resolveRectScreenRect(
                                  selectionPreviewRect,
                                  activeMap,
                                  boardRect,
                                );

                                return (
                                  <rect
                                    x={rect.x}
                                    y={rect.y}
                                    width={rect.width}
                                    height={rect.height}
                                    fill="rgba(216, 165, 77, 0.12)"
                                    stroke="rgba(216, 165, 77, 0.9)"
                                    strokeWidth={Math.max(
                                      1.5,
                                      rect.width / Math.max(10, selectionPreviewRect.width * 6),
                                    )}
                                  />
                                );
                              })()
                          : null}

                        {pendingWirePoint
                          ? (() => {
                              const rect = resolveBoardCellScreenRect(
                                pendingWirePoint,
                                activeMap,
                                boardRect,
                              );

                              return (
                                <rect
                                  x={rect.x}
                                  y={rect.y}
                                  width={rect.width}
                                  height={rect.height}
                                  fill="rgba(196, 55, 55, 0.12)"
                                  stroke="rgba(196, 55, 55, 0.96)"
                                  strokeWidth={Math.max(1.5, rect.width / 10)}
                                />
                              );
                            })()
                          : null}

                        {pastePreviewRect
                          ? pastePreviewRect.indices
                            ? resolveSelectionIndices(pastePreviewRect, activeMap).map((index) => {
                                const cellPoint = indexToPoint(index, activeMap);
                                const rect = resolveBoardCellScreenRect(
                                  cellPoint,
                                  activeMap,
                                  boardRect,
                                );
                                return (
                                  <rect
                                    key={`paste-preview-${index}`}
                                    x={rect.x}
                                    y={rect.y}
                                    width={rect.width}
                                    height={rect.height}
                                    fill="rgba(73, 138, 97, 0.12)"
                                    stroke="rgba(73, 138, 97, 0.9)"
                                    strokeWidth={Math.max(1.2, rect.width / 10)}
                                    strokeDasharray={`${Math.max(6, rect.width / 2)} ${Math.max(4, rect.width / 3)}`}
                                  />
                                );
                              })
                            : (() => {
                                const rect = resolveRectScreenRect(
                                  pastePreviewRect,
                                  activeMap,
                                  boardRect,
                                );

                                return (
                                  <rect
                                    x={rect.x}
                                    y={rect.y}
                                    width={rect.width}
                                    height={rect.height}
                                    fill="rgba(73, 138, 97, 0.12)"
                                    stroke="rgba(73, 138, 97, 0.9)"
                                    strokeWidth={Math.max(
                                      1.5,
                                      rect.width / Math.max(10, pastePreviewRect.width * 6),
                                    )}
                                    strokeDasharray={`${Math.max(6, rect.width / 8)} ${Math.max(4, rect.width / 12)}`}
                                  />
                                );
                              })()
                          : null}

                        {textPreviewRect
                          ? textPreviewRect.indices
                            ? resolveSelectionIndices(textPreviewRect, activeMap).map((index) => {
                                const cellPoint = indexToPoint(index, activeMap);
                                const rect = resolveBoardCellScreenRect(
                                  cellPoint,
                                  activeMap,
                                  boardRect,
                                );
                                return (
                                  <rect
                                    key={`text-preview-${index}`}
                                    x={rect.x}
                                    y={rect.y}
                                    width={rect.width}
                                    height={rect.height}
                                    fill="rgba(73, 138, 97, 0.1)"
                                    stroke="rgba(73, 138, 97, 0.94)"
                                    strokeWidth={Math.max(1.2, rect.width / 10)}
                                    strokeDasharray={`${Math.max(6, rect.width / 2)} ${Math.max(4, rect.width / 3)}`}
                                  />
                                );
                              })
                            : (() => {
                                const rect = resolveRectScreenRect(
                                  textPreviewRect,
                                  activeMap,
                                  boardRect,
                                );
                                return (
                                  <rect
                                    x={rect.x}
                                    y={rect.y}
                                    width={rect.width}
                                    height={rect.height}
                                    fill="rgba(73, 138, 97, 0.1)"
                                    stroke="rgba(73, 138, 97, 0.94)"
                                    strokeWidth={Math.max(
                                      1.5,
                                      rect.width / Math.max(10, textPreviewRect.width * 6),
                                    )}
                                    strokeDasharray={`${Math.max(6, rect.width / 8)} ${Math.max(4, rect.width / 12)}`}
                                  />
                                );
                              })()
                          : null}
                      </svg>
                    ) : null}

                    {hoverCellRects.map((hoverRect, index) => (
                      <div
                        key={`hover-${index}`}
                        className="boardHoverCell"
                        style={{
                          left: hoverRect.x,
                          top: hoverRect.y,
                          width: hoverRect.width,
                          height: hoverRect.height,
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </section>

        <div
          className={`panelSplitter ${layoutResizeState?.side === "right" ? "active" : ""}`}
          onPointerDown={(event) => beginLayoutResize(event, "right")}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize right sidebar"
        />

        <aside className="panel inspectorPanel">
          <div
            className="inspectorTabs inspectorTabsTri"
            role="tablist"
            aria-label="Inspector tabs"
          >
            {[
              ["palette", "Palette"],
              ["level", "Level"],
              ["inspect", "Inspect"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={inspectorTab === id}
                className={`inspectorTab ${inspectorTab === id ? "active" : ""}`}
                onClick={() => setInspectorTab(id as InspectorTab)}
              >
                {label}
              </button>
            ))}
          </div>

          {inspectorTab === "palette" ? (
            <section className="panelSection inspectorBody paletteSection compactPaletteSection">
              <div className="activeTileStrip">
                <button
                  type="button"
                  className={`activeTileCompactCard touchTargetButton ${lastPaletteAssignmentTarget === "primary" ? "targeted" : ""}`}
                  onClick={() => setLastPaletteAssignmentTarget("primary")}
                >
                  <div className="activeTileSlotLabel primary">LMB</div>
                  <TilePreview
                    tileset={tileset}
                    tile={primaryBrush}
                    className="activeTileCompactCanvas"
                    pixelSize={32}
                    directionArrowMode="palette"
                  />
                  <div className="activeTileCompactBody">
                    <div className="activeTileCompactName">{primaryBrushName}</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`activeTileCompactCard touchTargetButton ${lastPaletteAssignmentTarget === "secondary" ? "targeted" : ""}`}
                  onClick={() => setLastPaletteAssignmentTarget("secondary")}
                >
                  <div className="activeTileSlotLabel secondary">RMB</div>
                  <TilePreview
                    tileset={tileset}
                    tile={secondaryBrush}
                    className="activeTileCompactCanvas"
                    pixelSize={32}
                    directionArrowMode="palette"
                  />
                  <div className="activeTileCompactBody">
                    <div className="activeTileCompactName">{secondaryBrushName}</div>
                  </div>
                </button>
              </div>

              <input
                className="textField"
                type="search"
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
                placeholder="Filter by tile name"
              />

              <div className="paletteGrid">
                {paletteSections.length === 0 ? (
                  <div className="emptyState">No tiles match the current search.</div>
                ) : (
                  paletteSections.map((section) => (
                    <div
                      key={section.key}
                      className="paletteTileSection"
                      role="group"
                      aria-label={section.title}
                    >
                      <div className="paletteTileSectionTitle">{section.title}</div>
                      <div className="paletteTileGrid">
                        {section.tiles.map((entry) => {
                          const entryKey = tileSpecKey(entry.tile);
                          const isPrimary = tool !== "wire" && primaryBrushKey === entryKey;
                          const isSecondary = secondaryBrushKey === entryKey;
                          return (
                            <button
                              key={entry.key}
                              type="button"
                              className={`paletteGridItem ${isPrimary ? "selectedPrimary" : ""} ${isSecondary ? "selectedSecondary" : ""} ${isPrimary && isSecondary ? "selectedBoth" : ""}`}
                              title={entry.label}
                              aria-label={entry.label}
                              onClick={() => {
                                assignPaletteBrush(entry.tile, "primary");
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                if (!entry.allowSecondaryAssign) return;
                                assignPaletteBrush(entry.tile, "secondary");
                              }}
                            >
                              <TilePreview
                                tileset={tileset}
                                className="paletteGridCanvas"
                                pixelSize={32}
                                directionArrowMode="palette"
                                tile={entry.tile}
                              />
                              {isPrimary ? (
                                <span className="paletteGridMarker primary">L</span>
                              ) : null}
                              {isSecondary ? (
                                <span className="paletteGridMarker secondary">R</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {inspectorTab === "level" ? (
            <div className="inspectorTabBody levelInspectorTabBody">
              {documentMetadataPanel}
              {documentResizePanel}
            </div>
          ) : null}

          {inspectorTab === "inspect" ? (
            <div className="inspectorTabBody">
              <div className="inspectorSection">
                <div className="inspectorSectionTitle">Active Cell</div>
                {inspectableCell ? (
                  <>
                    <div className="inspectorMeta">
                      Cell {inspectableCell.point.x},{inspectableCell.point.y}
                    </div>
                    <div className="inspectorMeta">Index {inspectableCell.index}</div>
                    <div className="inspectorMeta">
                      Source:{" "}
                      {selection
                        ? selection.width === 1 && selection.height === 1
                          ? "selection"
                          : `selection origin (${selection.width}x${selection.height})`
                        : "hover"}
                    </div>
                    <div className="inspectorLayerList">
                      {inspectableCell.layers.map((layer) => (
                        <div key={layer.role} className="inspectorLayerRow">
                          <span className="inspectorLayerLabel">{LAYER_LABELS[layer.role]}</span>
                          <span className="inspectorLayerValue">{layer.label}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="emptyPanelState">
                    Hover a cell to inspect it, or use the select tool to pin one for editing.
                  </div>
                )}
              </div>

              {cellEditError ? <div className="panelInlineError">{cellEditError}</div> : null}

              <div className="inspectorSection">
                <div className="inspectorSectionTitle">Modifier Editor</div>
                {visualEditLockReason ? (
                  <div className="panelSubtext mutedPanelNotice">{visualEditLockReason}</div>
                ) : null}
                {inspectableCell ? (
                  editableInspectorLayers.length > 0 ? (
                    <fieldset className="plainFieldset" disabled={!canMutateBoard}>
                      <div className="inspectorEditorList">
                        {editableInspectorLayers.map((layer) => {
                          const defaultTile = resolveDefaultInspectorTile(layer.tile.tile);
                          const wiresModifier = getTileModifier(layer.tile, "WIRES") ??
                            resolveDefaultModifier(layer.tile.tile, "WIRES") ?? {
                              kind: "WIRES" as const,
                              wires: [],
                              tunnels: [],
                            };
                          const cloneModifier = getTileModifier(layer.tile, "CLONE_ARROWS") ??
                            resolveDefaultModifier(layer.tile.tile, "CLONE_ARROWS") ?? {
                              kind: "CLONE_ARROWS" as const,
                              arrows: CARDINAL_DIRS,
                            };
                          const customStyleModifier = getTileModifier(layer.tile, "CUSTOM_STYLE") ??
                            resolveDefaultModifier(layer.tile.tile, "CUSTOM_STYLE") ?? {
                              kind: "CUSTOM_STYLE" as const,
                              style: "GREEN" as const,
                            };
                          const letterModifier = getTileModifier(layer.tile, "LETTER_SYMBOL") ??
                            resolveDefaultModifier(layer.tile.tile, "LETTER_SYMBOL") ?? {
                              kind: "LETTER_SYMBOL" as const,
                              symbol: "A",
                            };
                          const logicModifier = getTileModifier(layer.tile, "LOGIC") ??
                            resolveDefaultModifier(layer.tile.tile, "LOGIC") ?? {
                              kind: "LOGIC" as const,
                              gate: "AND" as const,
                              facing: "E" as const,
                            };
                          const tracksModifier = getTileModifier(layer.tile, "TRACKS") ??
                            resolveDefaultModifier(layer.tile.tile, "TRACKS") ?? {
                              kind: "TRACKS" as const,
                              pieces: ["HORIZONTAL", "VERTICAL"] as const,
                              active: "H" as const,
                              entered: "W" as const,
                            };

                          return (
                            <div key={layer.role} className="inspectorEditorCard">
                              <div className="inspectorEditorHeader">
                                <div>
                                  <div className="inspectorSectionTitle">
                                    {LAYER_LABELS[layer.role]}
                                  </div>
                                  <div className="inspectorMeta">{layer.label}</div>
                                </div>
                              </div>

                              {tileSupportsDirection(layer.tile) ? (
                                <label className="fieldGroup compactFieldGroup">
                                  <span className="fieldCaption">Facing</span>
                                  <select
                                    className="textField compactField"
                                    value={layer.tile.dir ?? defaultTile.dir ?? "N"}
                                    onChange={(event) =>
                                      updateInspectableCellLayer(layer.role, (tile) => ({
                                        ...stripLower(tile),
                                        dir: event.target.value as Dir,
                                      }))
                                    }
                                  >
                                    {CARDINAL_DIRS.map((dir) => (
                                      <option key={dir} value={dir}>
                                        {formatDirectionLabel(dir)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}

                              {tileSupportsThinWallCanopy(layer.tile) ? (
                                <div className="fieldGroup compactFieldGroup">
                                  <span className="fieldCaption">Thin Walls</span>
                                  <div className="checkboxGrid">
                                    {CARDINAL_DIRS.map((dir) => {
                                      const thinWallState = layer.tile.thinWallCanopy ??
                                        defaultTile.thinWallCanopy ?? {
                                          walls: [],
                                          canopy: false,
                                        };
                                      return (
                                        <label key={dir} className="checkPill">
                                          <input
                                            type="checkbox"
                                            checked={thinWallState.walls.includes(dir)}
                                            onChange={(event) =>
                                              updateInspectableCellLayer(layer.role, (tile) => {
                                                const current = tile.thinWallCanopy ??
                                                  defaultTile.thinWallCanopy ?? {
                                                    walls: [],
                                                    canopy: false,
                                                  };
                                                return {
                                                  ...stripLower(tile),
                                                  thinWallCanopy: {
                                                    walls: toggleOrderedValue(
                                                      current.walls,
                                                      dir,
                                                      event.target.checked,
                                                      CARDINAL_DIRS,
                                                    ),
                                                    canopy: current.canopy,
                                                  },
                                                };
                                              })
                                            }
                                          />
                                          <span>{dir}</span>
                                        </label>
                                      );
                                    })}
                                    <label className="checkPill">
                                      <input
                                        type="checkbox"
                                        checked={
                                          (layer.tile.thinWallCanopy ?? defaultTile.thinWallCanopy)
                                            ?.canopy ?? false
                                        }
                                        onChange={(event) =>
                                          updateInspectableCellLayer(layer.role, (tile) => {
                                            const current = tile.thinWallCanopy ??
                                              defaultTile.thinWallCanopy ?? {
                                                walls: [],
                                                canopy: false,
                                              };
                                            return {
                                              ...stripLower(tile),
                                              thinWallCanopy: {
                                                walls: [...current.walls],
                                                canopy: event.target.checked,
                                              },
                                            };
                                          })
                                        }
                                      />
                                      <span>Canopy</span>
                                    </label>
                                  </div>
                                </div>
                              ) : null}

                              {tileSupportsDirectionalArrows(layer.tile) ? (
                                <div className="fieldGroup compactFieldGroup">
                                  <span className="fieldCaption">Directional Arrows</span>
                                  <div className="checkboxGrid">
                                    {CARDINAL_DIRS.map((dir) => {
                                      const arrowState = layer.tile.directionalArrows ??
                                        defaultTile.directionalArrows ?? {
                                          arrows: [],
                                        };
                                      return (
                                        <label key={dir} className="checkPill">
                                          <input
                                            type="checkbox"
                                            checked={arrowState.arrows.includes(dir)}
                                            onChange={(event) =>
                                              updateInspectableCellLayer(layer.role, (tile) => {
                                                const current = tile.directionalArrows ??
                                                  defaultTile.directionalArrows ?? {
                                                    arrows: [],
                                                  };
                                                return {
                                                  ...stripLower(tile),
                                                  directionalArrows: {
                                                    arrows: toggleOrderedValue(
                                                      current.arrows,
                                                      dir,
                                                      event.target.checked,
                                                      CARDINAL_DIRS,
                                                    ),
                                                  },
                                                };
                                              })
                                            }
                                          />
                                          <span>{dir}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {tileSupportsModifierKind(layer.tile, "WIRES") ? (
                                <>
                                  <div className="fieldGroup compactFieldGroup">
                                    <span className="fieldCaption">Wires</span>
                                    <div className="checkboxGrid">
                                      {CARDINAL_DIRS.map((dir) => (
                                        <label key={`wire-${dir}`} className="checkPill">
                                          <input
                                            type="checkbox"
                                            checked={wiresModifier.wires.includes(dir)}
                                            onChange={(event) =>
                                              updateInspectableCellLayer(layer.role, (tile) => {
                                                const nextWires = toggleOrderedValue(
                                                  wiresModifier.wires,
                                                  dir,
                                                  event.target.checked,
                                                  CARDINAL_DIRS,
                                                );
                                                return setTileModifier(
                                                  tile,
                                                  "WIRES",
                                                  nextWires.length > 0 ||
                                                    wiresModifier.tunnels.length > 0
                                                    ? {
                                                        kind: "WIRES",
                                                        wires: CARDINAL_DIRS.filter(
                                                          (candidate) =>
                                                            nextWires.includes(candidate) ||
                                                            wiresModifier.tunnels.includes(
                                                              candidate,
                                                            ),
                                                        ),
                                                        tunnels: [...wiresModifier.tunnels],
                                                      }
                                                    : null,
                                                );
                                              })
                                            }
                                          />
                                          <span>{dir}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="fieldGroup compactFieldGroup">
                                    <span className="fieldCaption">Wire Tunnels</span>
                                    <div className="checkboxGrid">
                                      {CARDINAL_DIRS.map((dir) => (
                                        <label key={`tunnel-${dir}`} className="checkPill">
                                          <input
                                            type="checkbox"
                                            checked={wiresModifier.tunnels.includes(dir)}
                                            onChange={(event) =>
                                              updateInspectableCellLayer(layer.role, (tile) => {
                                                const nextTunnels = toggleOrderedValue(
                                                  wiresModifier.tunnels,
                                                  dir,
                                                  event.target.checked,
                                                  CARDINAL_DIRS,
                                                );
                                                return setTileModifier(
                                                  tile,
                                                  "WIRES",
                                                  wiresModifier.wires.length > 0 ||
                                                    nextTunnels.length > 0
                                                    ? {
                                                        kind: "WIRES",
                                                        wires: CARDINAL_DIRS.filter(
                                                          (candidate) =>
                                                            wiresModifier.wires.includes(
                                                              candidate,
                                                            ) || nextTunnels.includes(candidate),
                                                        ),
                                                        tunnels: nextTunnels,
                                                      }
                                                    : null,
                                                );
                                              })
                                            }
                                          />
                                          <span>{dir}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              ) : null}

                              {tileSupportsModifierKind(layer.tile, "CLONE_ARROWS") ? (
                                <div className="fieldGroup compactFieldGroup">
                                  <span className="fieldCaption">Clone Arrows</span>
                                  <div className="checkboxGrid">
                                    {CARDINAL_DIRS.map((dir) => (
                                      <label key={`clone-${dir}`} className="checkPill">
                                        <input
                                          type="checkbox"
                                          checked={cloneModifier.arrows.includes(dir)}
                                          onChange={(event) =>
                                            updateInspectableCellLayer(layer.role, (tile) => {
                                              const nextArrows = toggleOrderedValue(
                                                cloneModifier.arrows,
                                                dir,
                                                event.target.checked,
                                                CARDINAL_DIRS,
                                              );
                                              return setTileModifier(
                                                tile,
                                                "CLONE_ARROWS",
                                                nextArrows.length > 0
                                                  ? {
                                                      kind: "CLONE_ARROWS",
                                                      arrows: nextArrows,
                                                    }
                                                  : null,
                                              );
                                            })
                                          }
                                        />
                                        <span>{dir}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {tileSupportsModifierKind(layer.tile, "CUSTOM_STYLE") ? (
                                <label className="fieldGroup compactFieldGroup">
                                  <span className="fieldCaption">Custom Style</span>
                                  <select
                                    className="textField compactField"
                                    value={customStyleModifier.style}
                                    onChange={(event) =>
                                      updateInspectableCellLayer(layer.role, (tile) =>
                                        setTileModifier(tile, "CUSTOM_STYLE", {
                                          kind: "CUSTOM_STYLE",
                                          style: event.target
                                            .value as (typeof CUSTOM_STYLE_VALUES)[number],
                                        }),
                                      )
                                    }
                                  >
                                    {CUSTOM_STYLE_VALUES.map((style) => (
                                      <option key={style} value={style}>
                                        {style}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}

                              {tileSupportsModifierKind(layer.tile, "LETTER_SYMBOL") ? (
                                <label className="fieldGroup compactFieldGroup">
                                  <span className="fieldCaption">Letter Symbol</span>
                                  <input
                                    className="textField compactField"
                                    type="text"
                                    maxLength={1}
                                    value={letterModifier.symbol}
                                    onChange={(event) => {
                                      const nextSymbol = event.target.value;
                                      if (
                                        nextSymbol.length > 0 &&
                                        !isValidLetterSymbol(nextSymbol)
                                      ) {
                                        setCellEditError(
                                          "Letter tiles accept arrows or ASCII characters from space through underscore.",
                                        );
                                        return;
                                      }

                                      updateInspectableCellLayer(layer.role, (tile) =>
                                        setTileModifier(
                                          tile,
                                          "LETTER_SYMBOL",
                                          nextSymbol.length > 0
                                            ? {
                                                kind: "LETTER_SYMBOL",
                                                symbol: nextSymbol,
                                              }
                                            : null,
                                        ),
                                      );
                                    }}
                                  />
                                </label>
                              ) : null}

                              {tileSupportsModifierKind(layer.tile, "LOGIC") ? (
                                <>
                                  <label className="fieldGroup compactFieldGroup">
                                    <span className="fieldCaption">Logic Gate</span>
                                    <select
                                      className="textField compactField"
                                      value={logicModifier.gate}
                                      onChange={(event) =>
                                        updateInspectableCellLayer(layer.role, (tile) =>
                                          setTileModifier(tile, "LOGIC", {
                                            kind: "LOGIC",
                                            gate: event.target
                                              .value as (typeof LOGIC_GATES)[number],
                                            ...(event.target.value === "COUNTER"
                                              ? { counterValue: 0 }
                                              : {
                                                  facing:
                                                    logicModifier.kind === "LOGIC" &&
                                                    logicModifier.gate !== "COUNTER"
                                                      ? (logicModifier.facing ?? "N")
                                                      : "N",
                                                }),
                                          }),
                                        )
                                      }
                                    >
                                      {LOGIC_GATES.map((gate) => (
                                        <option key={gate} value={gate}>
                                          {gate}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  {logicModifier.gate === "COUNTER" ? (
                                    <label className="fieldGroup compactFieldGroup">
                                      <span className="fieldCaption">Counter Value</span>
                                      <select
                                        className="textField compactField"
                                        value={logicModifier.counterValue ?? 0}
                                        onChange={(event) =>
                                          updateInspectableCellLayer(layer.role, (tile) =>
                                            setTileModifier(tile, "LOGIC", {
                                              kind: "LOGIC",
                                              gate: "COUNTER",
                                              counterValue: Number(event.target.value),
                                            }),
                                          )
                                        }
                                      >
                                        {Array.from({ length: 10 }, (_, value) => (
                                          <option key={value} value={value}>
                                            {value}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : (
                                    <label className="fieldGroup compactFieldGroup">
                                      <span className="fieldCaption">Logic Facing</span>
                                      <select
                                        className="textField compactField"
                                        value={logicModifier.facing ?? "N"}
                                        onChange={(event) =>
                                          updateInspectableCellLayer(layer.role, (tile) =>
                                            setTileModifier(tile, "LOGIC", {
                                              kind: "LOGIC",
                                              gate: logicModifier.gate,
                                              facing: event.target.value as Dir,
                                            }),
                                          )
                                        }
                                      >
                                        {CARDINAL_DIRS.map((dir) => (
                                          <option key={dir} value={dir}>
                                            {dir}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
                                </>
                              ) : null}

                              {tileSupportsModifierKind(layer.tile, "TRACKS") ? (
                                <>
                                  <div className="fieldGroup compactFieldGroup">
                                    <span className="fieldCaption">Track Pieces</span>
                                    <div className="checkboxGrid">
                                      {TRACK_PIECES.map((piece) => (
                                        <label key={piece} className="checkPill">
                                          <input
                                            type="checkbox"
                                            checked={tracksModifier.pieces.includes(piece)}
                                            onChange={(event) =>
                                              updateInspectableCellLayer(layer.role, (tile) => {
                                                const nextPieces = toggleOrderedValue(
                                                  tracksModifier.pieces,
                                                  piece,
                                                  event.target.checked,
                                                  TRACK_PIECES,
                                                );
                                                return setTileModifier(
                                                  tile,
                                                  "TRACKS",
                                                  nextPieces.length > 0
                                                    ? {
                                                        kind: "TRACKS",
                                                        pieces: nextPieces,
                                                        active: tracksModifier.active,
                                                        entered: tracksModifier.entered,
                                                      }
                                                    : null,
                                                );
                                              })
                                            }
                                          />
                                          <span>{formatTrackPieceLabel(piece)}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="formGrid twoColumnFormGrid">
                                    <label className="fieldGroup compactFieldGroup">
                                      <span className="fieldCaption">Active Exit</span>
                                      <select
                                        className="textField compactField"
                                        value={tracksModifier.active}
                                        onChange={(event) =>
                                          updateInspectableCellLayer(layer.role, (tile) =>
                                            setTileModifier(tile, "TRACKS", {
                                              kind: "TRACKS",
                                              pieces: [...tracksModifier.pieces],
                                              active: event.target
                                                .value as (typeof TRACK_ACTIVE_VALUES)[number],
                                              entered: tracksModifier.entered,
                                            }),
                                          )
                                        }
                                      >
                                        {TRACK_ACTIVE_VALUES.map((active) => (
                                          <option key={active} value={active}>
                                            {active}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="fieldGroup compactFieldGroup">
                                      <span className="fieldCaption">Entered From</span>
                                      <select
                                        className="textField compactField"
                                        value={tracksModifier.entered}
                                        onChange={(event) =>
                                          updateInspectableCellLayer(layer.role, (tile) =>
                                            setTileModifier(tile, "TRACKS", {
                                              kind: "TRACKS",
                                              pieces: [...tracksModifier.pieces],
                                              active: tracksModifier.active,
                                              entered: event.target.value as Dir,
                                            }),
                                          )
                                        }
                                      >
                                        {CARDINAL_DIRS.map((dir) => (
                                          <option key={dir} value={dir}>
                                            {dir}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : (
                    <div className="emptyPanelState">
                      This cell has no modifier-heavy layers. Try floor wires, tracks, logic, clone
                      machines, custom tiles, letter tiles, or directional blocks.
                    </div>
                  )
                ) : (
                  <div className="emptyPanelState">
                    Pick a cell before using the advanced cell editor.
                  </div>
                )}
              </div>

              <div className="inspectorSection">
                <div className="inspectorSectionTitle">Editing State</div>
                <div className="inspectorLayerRow">
                  <span className="inspectorLayerLabel">Tool</span>
                  <span className="inspectorLayerValue">
                    {tool === "wire"
                      ? "Wire"
                      : `${activeToolLabel} (${TOOL_SHORTCUTS.find((entry) => entry.id === tool)?.shortcut ?? "?"})`}
                  </span>
                </div>
                <div className="inspectorLayerRow">
                  <span className="inspectorLayerLabel">Selection</span>
                  <span className="inspectorLayerValue">
                    {selection ? `${selection.width}x${selection.height}` : "none"}
                  </span>
                </div>
                <div className="inspectorLayerRow">
                  <span className="inspectorLayerLabel">Clipboard</span>
                  <span className="inspectorLayerValue">
                    {clipboard ? `${clipboard.width}x${clipboard.height}` : "empty"}
                  </span>
                </div>
                <div className="inspectorLayerRow">
                  <span className="inspectorLayerLabel">Paste Preview</span>
                  <span className="inspectorLayerValue">
                    {pastePreviewActive ? "active" : "off"}
                  </span>
                </div>
              </div>

              <div className="inspectorSection">
                <div className="inspectorSectionTitle">Brush Assignment</div>
                <div className="inspectorLayerRow">
                  <span className="inspectorLayerLabel">Primary</span>
                  <span className="inspectorLayerValue">{primaryBrushName}</span>
                </div>
                <div className="inspectorLayerRow">
                  <span className="inspectorLayerLabel">Secondary</span>
                  <span className="inspectorLayerValue">{secondaryBrushName}</span>
                </div>
              </div>

              <div className="inspectorSection">
                <div className="inspectorSectionTitle">Shortcuts</div>
                <div className="shortcutList">
                  <div className="shortcutRow">
                    <span className="shortcutKey">Cmd/Ctrl+Z</span>
                    <span>Undo</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">Cmd/Ctrl+Shift+Z</span>
                    <span>Redo</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">B L F V E R I</span>
                    <span>Tool switch</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">N P</span>
                    <span>Next / previous level</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">, .</span>
                    <span>Rotate or cycle active brush</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">Cmd/Ctrl+X</span>
                    <span>Cut selection</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">Cmd/Ctrl+C</span>
                    <span>Copy selection</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">Cmd/Ctrl+V</span>
                    <span>Start paste preview</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">Enter</span>
                    <span>Commit paste preview</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">Delete</span>
                    <span>Erase selection</span>
                  </div>
                  <div className="shortcutRow">
                    <span className="shortcutKey">Esc</span>
                    <span>Clear selection / cancel paste</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </main>
      {selectionTransformMenu ? (
        <div
          className="dropdownMenu selectionTransformContextMenu"
          style={{
            position: "fixed",
            left: selectionTransformMenu.x,
            top: selectionTransformMenu.y,
          }}
        >
          {[
            ["Rotate 90°", "ROTATE_90"],
            ["Rotate 180°", "ROTATE_180"],
            ["Rotate 270°", "ROTATE_270"],
            ["Flip Horizontal", "FLIP_H"],
            ["Flip Vertical", "FLIP_V"],
            ["Flip Diagonal NW/SE", "FLIP_DIAG_NWSE"],
            ["Flip Diagonal NE/SW", "FLIP_DIAG_NESW"],
          ].map(([label, kind]) => (
            <button
              key={kind}
              type="button"
              className="dropdownMenuItem"
              onClick={() => applySelectionTransform(kind as LevelTransformKind)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
