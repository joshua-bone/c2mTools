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
  getLineIndices,
  indexToPoint,
  normalizeRect,
  pointToIndex,
  rectToIndices,
  type GridPoint,
  type GridRect,
} from "./editor/boardGeometry";
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
import { describeTileSpec, formatTileDisplayName, getTileSpecName } from "./editor/tileDisplay";
import { loadCc2Tileset } from "./loadCc2Tileset";
import { getPaletteSections } from "./paletteSections";
import { platform } from "./platform";
import { readLocalDocumentFile } from "./platform/browser";
import type { OpenedDocumentFile } from "./platform";
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
import {
  RECENT_LEVELS_STORAGE_KEY,
  createPersistedRecentLevelEntry,
  createRecentLevelId,
  decodePersistedRecentLevelEntry,
  findMatchingRecentLevelId,
  parsePersistedRecentLevels,
  removeRecentLevelEntry,
  serializePersistedRecentLevels,
  upsertRecentLevelEntry,
  type PersistedRecentLevelEntry,
} from "./recentLevelStorage";
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
const EYEDROPPER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g transform='rotate(45 12 12)'><rect x='10' y='2.5' width='4' height='11' rx='1.4' fill='%23f6fbff' stroke='%23121a1f' stroke-width='1.6'/><path d='M10 5.5H8.4A1.4 1.4 0 0 0 7 6.9v3.7A1.4 1.4 0 0 0 8.4 12H10' fill='none' stroke='%23121a1f' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M14 13v6' fill='none' stroke='%23121a1f' stroke-width='1.6' stroke-linecap='round'/><path d='M10.3 19.3h7.4' fill='none' stroke='%23121a1f' stroke-width='1.6' stroke-linecap='round'/><circle cx='14' cy='21' r='1.5' fill='%23235f7a'/></g></svg>\") 4 20, crosshair";

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

type InspectorTab = "palette" | "inspect";
type LeftPanelTab = "document" | "controls";
type BoardMenuId = "file" | "view" | "transform" | "ideas";
type PaletteAssignmentTarget = "primary" | "secondary";
type IdeasDialogId = "browse-walls" | "generate-walls";
type GeneratedWallLayoutRecord = Parameters<GenerateWallsDialogProps["onImport"]>[0];

type ToolMode = EditorToolMode;

type InitialAppState = Readonly<{
  history: C2mEditorHistory | null;
  fileName: string | null;
  jsonText: string;
  preferences: PersistedAppPreferences;
  recentLevels: ReadonlyArray<PersistedRecentLevelEntry>;
  activeRecentLevelId: string | null;
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
}>;

type WireDragState = Readonly<{
  tool: "wire";
  pointerId: number;
  lastPoint: GridPoint;
  baseMap: MapJson;
  previewMap: MapJson;
  mode: "add" | "remove";
}>;

type DragState = BrushDragState | LineDragState | SelectDragState | WireDragState;

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
      return "translate(-50%, calc(-100% - 10px))";
    case "horizontal":
      return "translate(calc(-100% - 10px), -50%) rotate(-90deg)";
    case "diag-desc":
      return edge === "top"
        ? "translate(-78%, calc(-100% - 10px)) rotate(-45deg)"
        : "translate(calc(-100% - 10px), -78%) rotate(-45deg)";
    case "diag-asc":
      return edge === "top"
        ? "translate(-22%, calc(-100% - 10px)) rotate(45deg)"
        : "translate(10px, -78%) rotate(45deg)";
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
      recentLevels: [],
      activeRecentLevelId: null,
    };
  }

  const preferences = parsePersistedAppPreferences(readLocalStorage(APP_PREFERENCES_STORAGE_KEY));
  const recentLevels = parsePersistedRecentLevels(readLocalStorage(RECENT_LEVELS_STORAGE_KEY));
  const session = parsePersistedEditorSession(readLocalStorage(EDITOR_SESSION_STORAGE_KEY));

  if (!session) {
    return {
      history: null,
      fileName: null,
      jsonText: "",
      preferences,
      recentLevels,
      activeRecentLevelId: null,
    };
  }

  const activeRecentLevelId = findMatchingRecentLevelId(
    recentLevels,
    session.doc,
    session.fileName,
  );

  return {
    history: createEditorHistory(session.doc),
    fileName: session.fileName,
    jsonText: stringifyC2mJsonV1(session.doc),
    preferences,
    recentLevels,
    activeRecentLevelId,
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
  const syncedJsonTextRef = useRef(initialAppState.jsonText);
  const recentLevelsRef = useRef<ReadonlyArray<PersistedRecentLevelEntry>>(
    initialAppState.recentLevels,
  );
  const activeRecentLevelIdRef = useRef<string | null>(initialAppState.activeRecentLevelId);
  const latestAutosaveDocRef = useRef<C2mJsonV1 | null>(initialAppState.history?.doc ?? null);
  const latestAutosaveFileNameRef = useRef<string | null>(initialAppState.fileName);
  const latestAutosaveTilesetRef = useRef<CC2Tileset | null>(null);
  const latestSessionSnapshotRef = useRef<PersistedEditorSession | null>(
    initialAppState.history && initialAppState.fileName
      ? {
          doc: initialAppState.history.doc,
          fileName: initialAppState.fileName,
        }
      : null,
  );

  const [viewMode, setViewMode] = useState<AppViewMode>(initialAppState.preferences.viewMode);
  const [history, setHistory] = useState<C2mEditorHistory | null>(initialAppState.history);
  const [fileName, setFileName] = useState<string | null>(initialAppState.fileName);
  const [jsonText, setJsonText] = useState<string>(initialAppState.jsonText);
  const [recentLevels, setRecentLevels] = useState<ReadonlyArray<PersistedRecentLevelEntry>>(
    initialAppState.recentLevels,
  );
  const [activeRecentLevelId, setActiveRecentLevelId] = useState<string | null>(
    initialAppState.activeRecentLevelId,
  );
  const [recentModalOpen, setRecentModalOpen] = useState(false);
  const [ideasDialogOpen, setIdeasDialogOpen] = useState<IdeasDialogId | null>(null);
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
  const [paletteQuery, setPaletteQuery] = useState("");
  const [tool, setTool] = useState<ToolMode>("brush");
  const [globalDirection, setGlobalDirection] = useState<Dir>("N");
  const [logicCounterValue, setLogicCounterValue] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("palette");
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>("document");
  const [boardMenuOpen, setBoardMenuOpen] = useState<BoardMenuId | null>(null);
  const [boardMenuDropdownShift, setBoardMenuDropdownShift] = useState(0);
  const [lastPaletteAssignmentTarget, setLastPaletteAssignmentTarget] =
    useState<PaletteAssignmentTarget>("primary");
  const [selection, setSelection] = useState<GridRect | null>(null);
  const [clipboard, setClipboard] = useState<C2mClipboard | null>(null);
  const [pastePreviewActive, setPastePreviewActive] = useState(false);
  const [layoutResizeState, setLayoutResizeState] = useState<LayoutResizeState | null>(null);
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
      width: history?.doc?.map?.width ?? 32,
      height: history?.doc?.map?.height ?? 32,
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

  const doc = history?.doc ?? null;
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
  const canSave = jsonOk;
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
  const boardCanvasCursor = boardStatus.isPanning
    ? "grabbing"
    : isAltPressed || tool === "eyedropper"
      ? EYEDROPPER_CURSOR
      : undefined;

  const selectionPreviewRect = useMemo(() => {
    if (!activeMap) return null;
    if (dragState?.tool === "select") {
      return normalizeRect(dragState.start, dragState.current, activeMap);
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
    return resolveClipboardPreviewRect(activeMap, pasteAnchor, clipboard);
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
  const activeToolLabel = TOOL_SHORTCUTS.find((entry) => entry.id === tool)?.label ?? tool;
  const preservedSectionTags = doc?.sections?.map((section) => section.tag) ?? [];
  const preservedExtraChunkTags = doc?.extraChunks?.map((section) => section.tag) ?? [];
  const resizeDirty =
    map !== null &&
    resizeDraft !== null &&
    !resizeDraftEquals(resizeDraft, makeMapResizeDraft(map));
  const documentTitle = metadataDraft
    ? metadataDraft.title || "Untitled Level"
    : (doc?.title ?? "Untitled Level");
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
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.altKey) setIsAltPressed(false);
    };
    const onBlur = () => {
      setIsAltPressed(false);
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

  const loadDocument = useCallback(
    (
      nextDoc: C2mJsonV1,
      options: Readonly<{
        fileName?: string | null;
        warnings?: ReadonlyArray<string>;
        recentLevelId?: string | null;
      }> = {},
    ) => {
      const nextJsonText = stringifyC2mJsonV1(nextDoc);
      syncedJsonTextRef.current = nextJsonText;
      setHistory(createEditorHistory(nextDoc));
      setJsonText(nextJsonText);
      setFileName(options.fileName ?? DEFAULT_C2M_FILE_NAME);
      setActiveRecentLevelId(options.recentLevelId ?? null);
      setWarnings([...(options.warnings ?? [])]);
      setError(null);
      setParseError(null);
      setRenderError(null);
    },
    [],
  );

  const applyDocumentChange = useCallback((nextDoc: C2mJsonV1, commitHistory: boolean) => {
    const nextJsonText = stringifyC2mJsonV1(nextDoc);
    syncedJsonTextRef.current = nextJsonText;
    setHistory((current) =>
      current
        ? commitHistory
          ? commitHistoryEvent(current, {
              type: "replace-doc",
              doc: nextDoc,
            })
          : {
              ...current,
              doc: nextDoc,
            }
        : createEditorHistory(nextDoc),
    );
    setJsonText(nextJsonText);
    setWarnings([]);
    setError(null);
    setParseError(null);
    setRenderError(null);
  }, []);

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
    const nextJsonText = stringifyC2mJsonV1(nextHistory.doc);
    syncedJsonTextRef.current = nextJsonText;
    setHistory(nextHistory);
    setJsonText(nextJsonText);
    setWarnings([]);
    setError(null);
    setParseError(null);
    setRenderError(null);
  }, []);

  const loadOpenedDocument = useCallback(
    (openedFile: OpenedDocumentFile) => {
      setError(null);
      setParseError(null);
      setRenderError(null);

      try {
        const recentLevelId = createRecentLevelId();
        if (openedFile.kind === "c2m") {
          const warnList: string[] = [];
          const decoded = decodeC2mToJsonV1(openedFile.bytes, (message) => warnList.push(message));
          loadDocument(decoded, {
            fileName: openedFile.name,
            warnings: warnList,
            recentLevelId,
          });
        } else {
          const parsedDoc = parseC2mJsonV1(JSON.parse(openedFile.text) as unknown);
          loadDocument(parsedDoc, {
            fileName: openedFile.name,
            recentLevelId,
          });
        }

        resetBoardTransientState({
          clearSelection: true,
          resetView: true,
        });
        setViewMode("board");
      } catch (err: unknown) {
        setError(asErrorMessage(err));
      }
    },
    [loadDocument, resetBoardTransientState],
  );

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

  const updateHoverAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const hoverPoint = resolveBoardCellAtClientPoint(clientX, clientY);

      boardStatusStoreRef.current.update({
        hoverPoint,
        hoverCellSummary: buildHoverCellSummary(activeMap, hoverPoint),
      });
    },
    [activeMap, resolveBoardCellAtClientPoint],
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

  const copySelection = useCallback(() => {
    if (!map || !selection) return;
    setClipboard(copyMapRegion(map, selection));
    setTool("select");
  }, [map, selection]);

  const clearSelectionState = useCallback(() => {
    setSelection(null);
    setPastePreviewActive(false);
  }, []);

  const eraseSelection = useCallback(() => {
    if (!map || !selection || !canMutateBoard) return;

    const nextMap = paintMapCells(map, rectToIndices(selection, map), ERASER_BRUSH);
    commitMapChange(nextMap);
    setPastePreviewActive(false);
  }, [canMutateBoard, commitMapChange, map, selection]);

  const clearActiveMap = useCallback(() => {
    if (!map || !canMutateBoard) return;

    resetBoardTransientState({
      clearSelection: true,
    });
    commitMapChange(clearMapToFloor(map));
  }, [canMutateBoard, commitMapChange, map, resetBoardTransientState]);

  const beginPastePreview = useCallback(() => {
    if (!clipboard) return;
    setTool("select");
    setPastePreviewActive(true);
  }, [clipboard]);

  const commitPastePreview = useCallback(
    (anchorOverride?: GridPoint | null) => {
      if (!map || !clipboard || !canMutateBoard) return;

      const anchor =
        anchorOverride ??
        boardStatus.hoverPoint ??
        (selection ? { x: selection.x, y: selection.y } : { x: 0, y: 0 });
      const nextMap = pasteMapRegion(map, anchor, clipboard);
      const nextSelection = resolveClipboardPreviewRect(map, anchor, clipboard);

      if (commitMapChange(nextMap)) {
        setSelection(nextSelection);
      }
      setPastePreviewActive(false);
    },
    [boardStatus.hoverPoint, canMutateBoard, clipboard, commitMapChange, map, selection],
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

  const persistRecentLevelsToStorage = useCallback(
    (
      entries: ReadonlyArray<PersistedRecentLevelEntry>,
    ): ReadonlyArray<PersistedRecentLevelEntry> => {
      let candidate = [...entries];
      while (candidate.length > 0) {
        if (
          writeLocalStorage(RECENT_LEVELS_STORAGE_KEY, serializePersistedRecentLevels(candidate))
        ) {
          recentLevelsRef.current = candidate;
          setRecentLevels(candidate);
          return candidate;
        }
        candidate = candidate.slice(0, -1);
      }

      const fallback = recentLevelsRef.current;
      if (
        fallback.length > 0 &&
        writeLocalStorage(RECENT_LEVELS_STORAGE_KEY, serializePersistedRecentLevels(fallback))
      ) {
        setRecentLevels(fallback);
        return fallback;
      }

      removeLocalStorage(RECENT_LEVELS_STORAGE_KEY);
      recentLevelsRef.current = [];
      setRecentLevels([]);
      return [];
    },
    [],
  );

  const flushAutosavedRecentLevel = useCallback(() => {
    const nextDoc = latestAutosaveDocRef.current;
    if (!nextDoc) return;

    let nextRecentLevelId = activeRecentLevelIdRef.current;
    if (!nextRecentLevelId) {
      nextRecentLevelId = createRecentLevelId();
      activeRecentLevelIdRef.current = nextRecentLevelId;
      setActiveRecentLevelId(nextRecentLevelId);
    }

    const persistedEntries = persistRecentLevelsToStorage(
      upsertRecentLevelEntry(
        recentLevelsRef.current,
        createPersistedRecentLevelEntry({
          id: nextRecentLevelId,
          doc: nextDoc,
          fileName: latestAutosaveFileNameRef.current ?? DEFAULT_C2M_FILE_NAME,
          thumbnailDataUrl: renderRecentLevelThumbnail(nextDoc, latestAutosaveTilesetRef.current),
        }),
      ),
    );

    if (!persistedEntries.some((entry) => entry.id === nextRecentLevelId)) {
      activeRecentLevelIdRef.current = null;
      setActiveRecentLevelId(null);
    }
  }, [persistRecentLevelsToStorage]);

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
                type: "replace-doc",
                doc: parsedDoc,
              })
            : createEditorHistory(parsedDoc),
        );
        setWarnings([]);
        setError(null);
        setRenderError(null);
      } catch (err: unknown) {
        setParseError(asErrorMessage(err));
      }
    }, 400);

    return () => window.clearTimeout(handle);
  }, [doc, jsonText, jsonTextPresent]);

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

    if (!activeMap) {
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
        canvas.width !== activeMap.width * BOARD_TILE_PIXEL_SIZE ||
        canvas.height !== activeMap.height * BOARD_TILE_PIXEL_SIZE;
      const cache = getSharedCc2CanvasCellCache(tileset);
      const redrawPlan = resolveBoardMapRedrawPlan(previousMap, activeMap, {
        canReuseCanvas: !sizeChanged && lastRenderedTilesetRef.current === tileset,
        partialThreshold: Math.min(
          MAX_PARTIAL_REDRAW_CELLS,
          Math.max(32, Math.ceil(activeMap.tiles.length * PARTIAL_REDRAW_RATIO)),
        ),
      });
      const overlayIndices = new Set<number>();
      if (pointWithinMap(previousWireSpoolOverlayPoint, activeMap)) {
        overlayIndices.add(pointToIndex(previousWireSpoolOverlayPoint, activeMap));
      }
      if (pointWithinMap(currentWireSpoolOverlayPoint, activeMap)) {
        overlayIndices.add(pointToIndex(currentWireSpoolOverlayPoint, activeMap));
      }
      const ctx =
        redrawPlan.kind === "full"
          ? drawCc2MapToCanvas(canvas, activeMap, cache)
          : canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");

      if (redrawPlan.kind === "partial") {
        const indices = new Set(redrawPlan.indices);
        for (const index of overlayIndices) {
          indices.add(index);
        }
        if (indices.size > 0) {
          drawCc2CellsToContext(ctx, activeMap, [...indices], cache);
        }
      }

      if (pointWithinMap(currentWireSpoolOverlayPoint, activeMap)) {
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
      lastRenderedMapRef.current = activeMap;
      lastRenderedTilesetRef.current = tileset;
      lastWireSpoolOverlayPointRef.current = currentWireSpoolOverlayPoint;
    } catch (err: unknown) {
      setRenderError(
        `Board rendering failed. The document is still loaded and raw JSON remains available.\n${asErrorMessage(err)}`,
      );
    }
  }, [activeMap, currentWireSpoolOverlayPoint, doc, tileset, tilesetError, viewMode]);

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
    recentLevelsRef.current = recentLevels;
  }, [recentLevels]);

  useEffect(() => {
    activeRecentLevelIdRef.current = activeRecentLevelId;
  }, [activeRecentLevelId]);

  useEffect(() => {
    latestAutosaveDocRef.current = doc;
    latestAutosaveFileNameRef.current = fileName;
    latestAutosaveTilesetRef.current = tileset;
  }, [doc, fileName, tileset]);

  useEffect(() => {
    latestSessionSnapshotRef.current =
      doc && fileName
        ? {
            doc,
            fileName,
          }
        : null;
  }, [doc, fileName]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const flushPersistedSession = () => {
      flushAutosavedRecentLevel();
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
  }, [flushAutosavedRecentLevel]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (recentPersistTimeoutRef.current !== null) {
      window.clearTimeout(recentPersistTimeoutRef.current);
    }

    if (!doc) return;

    recentPersistTimeoutRef.current = window.setTimeout(() => {
      flushAutosavedRecentLevel();
      recentPersistTimeoutRef.current = null;
    }, DOCUMENT_PERSIST_DEBOUNCE_MS);

    return () => {
      if (recentPersistTimeoutRef.current !== null) {
        window.clearTimeout(recentPersistTimeoutRef.current);
      }
    };
  }, [doc, fileName, flushAutosavedRecentLevel, tileset]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (sessionPersistTimeoutRef.current !== null) {
      window.clearTimeout(sessionPersistTimeoutRef.current);
    }

    if (!doc) {
      removeLocalStorage(EDITOR_SESSION_STORAGE_KEY);
      return;
    }

    const persistSession = () => {
      writeLocalStorage(
        EDITOR_SESSION_STORAGE_KEY,
        serializePersistedEditorSession({
          doc,
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
  }, [doc, fileName]);

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

    setSelection(nextSelection);
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
    if (dragState?.tool === "brush") return;
    if (transientMap) setTransientMap(null);
  }, [dragState, transientMap]);

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
          rotateSelectedPaletteBrush("counterclockwise");
          return;
        }

        if (event.key === "." || event.key === ">") {
          event.preventDefault();
          rotateSelectedPaletteBrush("clockwise");
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
          setTool(command.tool);
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
    clearSelectionState,
    clipboard,
    commitPastePreview,
    copySelection,
    eraseSelection,
    onRedo,
    onUndo,
    pastePreviewActive,
    resetBoardTransientState,
    rotateSelectedPaletteBrush,
    selection,
    viewMode,
  ]);

  const onNewClick = useCallback(() => {
    loadDocument(createEmptyC2mDoc(), {
      fileName: DEFAULT_C2M_FILE_NAME,
      recentLevelId: createRecentLevelId(),
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
        const openedFile = await platform.openDocumentFile();
        if (!openedFile) return;
        loadOpenedDocument(openedFile);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        setError(asErrorMessage(err));
      }
    })();
  }, [loadOpenedDocument]);

  const onOpenRecentClick = useCallback(() => {
    setRecentModalOpen(true);
  }, []);

  const openRecentLevel = useCallback(
    (entry: PersistedRecentLevelEntry) => {
      try {
        const restored = decodePersistedRecentLevelEntry(entry);
        loadDocument(restored.doc, {
          fileName: restored.fileName,
          warnings: restored.warnings,
          recentLevelId: entry.id,
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
    [loadDocument, resetBoardTransientState],
  );

  const deleteRecentLevel = useCallback(
    (id: string) => {
      if (recentPersistTimeoutRef.current !== null && activeRecentLevelIdRef.current === id) {
        window.clearTimeout(recentPersistTimeoutRef.current);
        recentPersistTimeoutRef.current = null;
      }

      persistRecentLevelsToStorage(removeRecentLevelEntry(recentLevelsRef.current, id));
    },
    [persistRecentLevelsToStorage],
  );

  const scrollRecentCarousel = useCallback((direction: -1 | 1) => {
    const element = recentCarouselRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(240, Math.round(element.clientWidth * 0.8)),
      behavior: "smooth",
    });
  }, []);

  const onSaveAsC2m = useCallback(() => {
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

      const file = event.dataTransfer.files?.item(0) ?? null;
      if (!file) return;

      void readLocalDocumentFile(file)
        .then((openedFile) => {
          loadOpenedDocument(openedFile);
        })
        .catch((err: unknown) => {
          setError(asErrorMessage(err));
        });
    },
    [loadOpenedDocument],
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
      boardStatusStoreRef.current.update({
        hoverPoint: point,
        hoverCellSummary: buildHoverCellSummary(activeMap, point),
      });
      if (!point) {
        if (event.button === 0) {
          event.preventDefault();
          beginBoardPanGesture(event.currentTarget, event.pointerId, event.clientX, event.clientY);
        }
        return;
      }

      if (event.altKey || tool === "eyedropper") {
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
        event.currentTarget.setPointerCapture(event.pointerId);
        setPastePreviewActive(false);
        setDragState({
          tool: "select",
          pointerId: event.pointerId,
          start: point,
          current: point,
        });
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
      tool,
      updateHoverAtClientPoint,
      beginBoardPanGesture,
    ],
  );

  const onBoardPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activeMap || !boardRect) return;

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
            setSelection(normalizeRect(dragState.start, point ?? dragState.current, activeMap));
          }
          setDragState(null);
          setPastePreviewActive(false);
          updateHoverAtClientPoint(event.clientX, event.clientY);
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
  }, [dragState, replaceMapChangeLive]);

  const onBoardPointerLeave = useCallback(() => {
    if (dragPanRef.current || dragState) return;

    boardStatusStoreRef.current.update({
      hoverPoint: null,
      hoverCellSummary: null,
    });
  }, [dragState]);

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
                {recentLevels.length > 1 ? (
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

            {recentLevels.length === 0 ? (
              <div className="emptyState largeEmptyState">
                Recent levels will appear here after you create, open, or edit a map.
              </div>
            ) : (
              <div ref={recentCarouselRef} className="recentLevelsCarousel">
                {recentLevels.map((entry) => (
                  <article key={entry.id} className="recentLevelCard">
                    <button
                      type="button"
                      className="recentLevelPreviewButton"
                      onClick={() => openRecentLevel(entry)}
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
                        {entry.width && entry.height ? `${entry.width}x${entry.height}` : "No map"}{" "}
                        · {formatRecentLevelUpdatedAt(entry.updatedAt)}
                      </div>
                    </div>
                    <div className="boardControlRow boardCommandRow recentLevelActions">
                      <button
                        type="button"
                        className="actionButton"
                        onClick={() => openRecentLevel(entry)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="secondaryButton"
                        onClick={() => deleteRecentLevel(entry.id)}
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
                      disabled={!canSave}
                      onClick={() => {
                        setBoardMenuOpen(null);
                        onSaveAsC2m();
                      }}
                    >
                      Save C2M
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
              aria-selected={leftPanelTab === "document"}
              className={`inspectorTab ${leftPanelTab === "document" ? "active" : ""}`}
              onClick={() => setLeftPanelTab("document")}
            >
              Document
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

          {leftPanelTab === "document" ? (
            <section className="panelSection leftPanelTabBody levelManagerSection">
              <div className="sectionHeader">
                <div className="levelManagerHeaderCopy">
                  <div className="sectionEyebrow">Document</div>
                  <h2 className="sectionTitle">{documentTitle}</h2>
                </div>
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
                  disabled={!canSave}
                  onClick={onSaveAsC2m}
                >
                  Save
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

              {!doc ? (
                <div className="emptyState">
                  Create a blank level or open an existing `.c2m`/`.json` file to start editing.
                </div>
              ) : null}

              {doc ? documentMetadataPanel : null}
              {doc ? documentResizePanel : null}
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
                  onClick={copySelection}
                  disabled={!selection}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={pastePreviewActive ? () => commitPastePreview() : beginPastePreview}
                  disabled={!clipboard || (pastePreviewActive && !canMutateBoard)}
                >
                  {pastePreviewActive ? "Commit Paste" : "Paste"}
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
                <div className="sectionActions boardToolRow">
                  {TOOL_SHORTCUTS.map((entry) => {
                    const mutatesBoard =
                      entry.id === "brush" ||
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
                onContextMenu={(event) => event.preventDefault()}
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
                          ? (() => {
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
                          ? (() => {
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
          <div className="inspectorTabs" role="tablist" aria-label="Inspector tabs">
            {[
              ["palette", "Palette"],
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
                    <span className="shortcutKey">, .</span>
                    <span>Rotate or cycle active brush</span>
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
    </div>
  );
}
