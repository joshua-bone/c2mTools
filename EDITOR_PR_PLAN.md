# C2M Editor PR Plan

## Objective

Ship a full-featured browser editor for `.c2m` files by porting the reusable editor patterns from `../DATTools` and rebuilding the C2M-specific editing core where DAT assumptions do not hold.

## Progress

- [x] PR 1: Editor Shell And Document Lifecycle
- [x] PR 2: C2M Editing Core
- [x] PR 3: Board Surface And Palette
- [x] PR 4: Editing Tools
- [x] PR 5: Metadata, Resize, And Advanced Inspector
- [x] PR 6: Performance, Hardening, And Docs

## Non-Negotiable Rules

- Maps must be constrained to `10x10` through `100x100` inclusive.
- Painting a terrain tile replaces the whole cell.
- Painting a non-terrain item replaces only its logical layer in the cell.
- Example: painting a key overwrites force boots but does not overwrite a monster.
- The existing C2M fidelity guarantees must survive:
  - byte-identical save when unchanged via `sections[]`
  - preservation of unknown chunks / raw blobs
  - advanced raw JSON editing remains available

## Scope Decision

Default approach:

- Reuse `DATTools` editor patterns and small helper modules.
- Do not try to extract a shared package in this effort.
- Do not port DAT-only features:
  - levelset list management
  - DAT 3D mode
  - trap/cloner connect tool
  - monster order overlays
  - Tworld / Lexy export helpers
  - Tauri / desktop update flows

## PR Sequence

### PR 1: Editor Shell And Document Lifecycle

Purpose:

- Replace the current single-file web app structure with an editor shell that can grow cleanly.

Scope:

- [x] Split `web/src/App.tsx` into editor-focused modules.
- [x] Add browser file open/save helpers for `.c2m` and `.json`.
- [x] Add `New`, `Open`, `Save C2M`, and `Download JSON`.
- [x] Add persisted session and app preferences.
- [x] Add `createEmptyC2mDoc()` for a valid blank level.
- [x] Add event-based document history for undo/redo.
- [x] Preserve the current JSON view and image preview as the first working shell.

Target files:

- `web/src/App.tsx`
- `web/src/platform/*`
- `web/src/persistedAppState.ts`
- `web/src/editor/createEmptyC2mDoc.ts`
- `web/src/editor/editorHistory.ts`
- `web/src/editor/fileName.ts`

Acceptance criteria:

- [x] Can create a new document, open a `.c2m`, save a `.c2m`, and download JSON.
- [x] Existing transform buttons still work.
- [x] Session restore reloads the last open doc and filename.
- [x] No-op open/save still passes current binary-fidelity expectations.

Validation:

- [x] Add tests for persisted session, persisted preferences, and editor history.
- [x] Add a blank-document encode/decode test.

### PR 2: C2M Editing Core

Purpose:

- Build the C2M-native data model that a visual editor can operate on safely.

Scope:

- [x] Export a CC2 tile catalog and tile classification from core code instead of duplicating tile knowledge in the web layer.
- [x] Add variable-size board geometry helpers.
- [x] Add editor-side size validation for `10..100`.
- [x] Add cell-stack helpers for:
  - [x] flattening a `TileSpecJson`
  - [x] rebuilding / canonicalizing a `TileSpecJson`
  - [x] classifying terrain vs non-terrain layers
  - [x] replacing the full cell
  - [x] replacing only a compatible non-terrain layer
- [x] Add rectangular clipboard helpers.
- [x] Add paint preview helpers shared by brush/line/fill/paste.

Target files:

- `src/c2m/mapCodec.ts`
- `src/c2m/render/cc2RendererCore.ts`
- `web/src/editor/c2mTileCatalog.ts`
- `web/src/editor/cellStack.ts`
- `web/src/editor/boardGeometry.ts`
- `web/src/editor/levelEditing.ts`

Acceptance criteria:

- [x] Terrain paint replaces the whole cell.
- [x] Non-terrain paint replaces only its compatible layer.
- [x] Example cases are covered in tests, including key-over-boots while preserving monster.
- [x] Clipboard copy/paste works on variable-size maps.
- [x] Core helpers operate correctly for any map size from `10x10` to `100x100`.

Validation:

- [x] Add helper tests for:
  - [x] map size bounds
  - [x] terrain replacement
  - [x] non-terrain layer replacement
  - [x] copy/paste semantics
  - [x] special-tile preservation for wires, tracks, logic, thin walls, directional block, letter tile, custom styles

### PR 3: Board Surface And Palette

Purpose:

- Replace the image-only view with a real interactive board.

Scope:

- [x] Port/adapt board canvas presentation helpers from `DATTools`.
- [x] Add board pan/zoom and hover status.
- [x] Add a palette with search and primary/secondary brush assignment.
- [x] Add CC2 tile previews.
- [x] Add an inspector placeholder for cell details.
- [x] Keep raw JSON as a separate advanced tab.

Target files:

- `web/src/App.tsx`
- `web/src/boardCanvasPresentation.ts`
- `web/src/boardEditorStatus.ts`
- `web/src/TilePreview.tsx`
- `web/src/paletteSections.ts`
- `web/src/editor/renderPreview.ts`

Acceptance criteria:

- [x] The board is the primary editing surface.
- [x] Users can choose tiles from a searchable palette.
- [x] Hovering a cell shows useful stack information.
- [x] Panning and zooming work on large maps.

Validation:

- [x] Add tests for board presentation math, hover summaries, and palette sections.
- [x] Add guard coverage for default brush specs used by palette previews/assignment.

### PR 4: Editing Tools

Purpose:

- Reach parity with the core board-editing workflow from `DATTools`.

Scope:

- [x] Add brush, line, fill, select, erase, eyedropper, copy, paste, undo, and redo.
- [x] Add keyboard shortcuts.
- [x] Add paste preview and selection overlays.
- [x] Add transform actions to the visual editor shell.
- [x] Keep JSON and board state synchronized without clobbering invalid raw edits.

Target files:

- `web/src/App.tsx`
- `web/src/editor/levelEditing.ts`
- `web/src/editor/shortcuts.ts`
- `web/src/boardRenderInvalidation.ts`

Acceptance criteria:

- [x] A level can be edited fully from the board UI.
- [x] Undo/redo works across the visual tools.
- [x] Selection copy/paste respects the C2M layer replacement rules.
- [x] Invalid raw JSON never silently overwrites the current visual state.

Validation:

- [x] Add tests for editor operations and dirty-cell diff behavior.
- [x] Keep all existing transform and codec tests green.

### PR 5: Metadata, Resize, And Advanced Inspector

Purpose:

- Make the editor complete for normal authoring, not just map painting.

Scope:

- [x] Add forms for common top-level fields:
  - [x] `title`
  - [x] `author`
  - [x] `editorVersion`
  - [x] `clue`
  - [x] `note`
  - [x] `lock`
  - [x] `readOnlyChunk`
- [x] Add forms for supported `options.*` fields.
- [x] Add map resize controls with `10..100` enforcement.
- [x] Add a cell inspector for modifier-heavy tiles.
- [x] Add an advanced tab for raw JSON and preserved blob/chunk fields.

Target files:

- `web/src/App.tsx`
- `web/src/editor/metadataDraft.ts`
- `web/src/editor/mapResize.ts`
- `web/src/editor/cellInspector.ts`

Acceptance criteria:

- [x] Common metadata can be edited without touching raw JSON.
- [x] Maps can be resized within bounds.
- [x] Modifier-heavy cells can be edited without dropping unsupported fields.
- [x] Advanced users can still inspect and edit raw JSON.

Validation:

- [x] Add tests for metadata patching and resize behavior.
- [x] Add regression tests proving untouched preserved sections stay intact after normal metadata edits.

### PR 6: Performance, Hardening, And Docs

Purpose:

- Make the editor robust enough to ship and maintain.

Scope:

- [x] Add CC2 preview caching for palette and board rendering.
- [x] Add partial redraw logic where it actually helps.
- [x] Tighten error messaging around invalid docs and unsupported edit states.
- [x] Update `README.md` and `docs/web-app.md` to describe the editor workflow.
- [x] Document any remaining advanced-mode fallbacks.

Target files:

- `web/src/*`
- `README.md`
- `docs/web-app.md`

Acceptance criteria:

- [x] Large maps remain usable.
- [x] The editor workflow is documented.
- [x] Known limitations are documented instead of hidden.

Validation:

- [x] Run `npm run typecheck` and `npm test`.
- [x] Add or update smoke coverage if needed for large-map rendering paths.

## Out Of Scope For This Sequence

- Shared editor package across repos
- Desktop/Tauri app support
- DAT feature parity where C2M has no analogue
- Full CC2 gameplay-rule validation beyond structural validity and preservation

## Risks To Watch

- Modifier-heavy cells are the main place where a naive painter will corrupt data.
- Large maps make full-canvas rerendering more expensive than in DAT.
- Blank-document defaults must come from the real encoder/fixtures, not from guesswork.

## Recommended Next Move

PR sequence complete.

Reason:

- PR 6 is complete and the planned browser-editor scope is now implemented end-to-end.
- The remaining work is no longer missing planned product scope; it is follow-up polish, manual QA, and release prep.
- The editor now covers board editing, metadata, resize, transforms, advanced JSON, and preservation guarantees.

## Immediate Next Task After PR 6

Follow-up work, if desired:

- [ ] Do a manual browser QA pass on large maps, raw-JSON failure recovery, and modifier-heavy cell edits.
- [ ] Review UX polish issues discovered during manual QA and decide whether they warrant a follow-up PR.
- [ ] Prepare a commit/PR description summarizing the six-part editor rollout.

## Done Definition

This plan is complete when `c2mTools` can visually create, open, edit, and save `.c2m` files with:

- board-first editing
- metadata editing
- selection/copy/paste
- undo/redo
- transforms
- advanced raw JSON access
- preservation guarantees intact
