# C2G Plan

## Goal

Migrate `c2mTools` from a single-level editor to a levelset editor, using C2G as the set-order manifest in the same broad workflow that `DATTools` uses for DAT levelsets:

- left sidebar: levelset / level manager
- right sidebar: per-level metadata and inspector tabs
- `File > Open`: single level, folder, or zipped folder
- `File > Save Level`: existing single `.c2m` output
- `File > Save Set`: zipped folder containing levels plus root C2G

## Scope

We are **not** implementing full C2G semantics.

We are only using C2G for:

- set name (`game`)
- ordered level references (`map`, including `map` that appears later on a line such as `music ... map "..."`)

Everything else in the C2G must be:

- parsed only enough to preserve it
- silently ignored by the editor UI
- re-emitted on save
- editable through a raw `Edit C2G` modal

## C2G Findings

Primary source: https://wiki.bitbusters.club/C2G

Relevant bits from the wiki:

- C2G is a plain-text file beginning with `game "Name"`.
- Levels are loaded through `map "path/to/file.c2m"` commands.
- `map` can appear on the same line as other commands such as `music`.
- C2G supports many other commands (`chdir`, `chain`, `script`, `goto`, `if/elseif/else/endif`, `do/end`, comments, etc.).
- Scripting / control-flow behavior is under-documented, so a full semantic editor would be high risk.

## Recommendation

Default approach: **text-preserving C2G plus extracted map-entry blocks**, not a full interpreter.

Why:

- It matches the requested scope.
- It keeps unknown / advanced commands intact.
- It lets the UI manage level order without pretending we understand all control flow.
- It is incremental and testable.

Rejected alternatives:

1. Full C2G AST / interpreter.
   Too much scope for the current goal.

2. Ignore C2G structure entirely and regenerate a fresh minimal file every save.
   Too destructive; it would lose unknown commands and formatting.

## Proposed Data Model

### 1. New levelset document model

Add a set-level document wrapper around the existing `C2mJsonV1` level document.

Working shape:

```ts
type C2mLevelsetJsonV1 = {
  schema: "c2mTools.c2g.levelset.json.v1";
  setName: string;
  c2gFileName: string;
  levels: Array<{
    id: string;
    relativePath: string;
    fileName: string;
    doc: C2mJsonV1;
    warnings?: string[];
    source: "existing" | "generated";
  }>;
  c2g: C2gTextDocument;
};
```

### 2. C2G text-preservation model

Represent the C2G as raw text plus extracted map-entry blocks.

Working shape:

```ts
type C2gTextDocument = {
  rawText: string;
  gameName: string | null;
  prefixText: string;
  suffixText: string;
  entries: Array<{
    blockText: string; // leading attached statements/comments + owning map-bearing line
    relativePath: string; // extracted path for the UI
  }>;
  preservedStatements: Array<string>; // non-entry text retained outside level ordering
};
```

Important behavior:

- We will treat the editor’s level order as the order of extracted `entries`.
- Each `entry` is a **block**, not just a bare `map` token.
- A block may include attached statements that should move with the level, for example:
  - comments immediately above the map line
  - `music ... map "..."` lines
  - other opaque lines we choose to associate with the next map
- Unknown statements outside entry blocks are preserved in `prefixText` / `suffixText` or opaque preserved sections.

This is intentionally textual, not semantic.

## Behavioral Rules

### Open

`File > Open` should accept:

1. A single `.c2m`
   - load as a one-level set
   - synthesize a minimal C2G in memory

2. A folder
   - discover `.c2m` files in flat or nested structure
   - if root has one `.c2g`, use it for level order
   - if root has no `.c2g`, synthesize one from discovered levels

3. A `.zip`
   - unzip in memory
   - apply the same folder rules

### Save

`File` menu becomes:

- `Save Level`
- `Save Set`

`Save Level`:

- writes only the active level as a `.c2m`
- keeps current single-level save behavior

`Save Set`:

- outputs a zipped folder
- root contains one `.c2g`
- level files are written at their relative paths
- unknown C2G commands are preserved
- level order is rewritten from the level manager into the C2G entry order

### Raw C2G editing

Add `Edit C2G` button / menu action:

- opens modal with raw text
- save reparses only the supported pieces (`game`, `map` / map-bearing statements)
- unsupported commands remain untouched
- if parsing fails for supported constructs, block modal save with a targeted error

## UI Migration

Match the `DATTools` layout pattern.

### Left sidebar

Replace the current document tab with a DAT-style level manager:

- level list
- add
- duplicate
- delete
- drag reorder
- context menu where DATTools already uses one

This updates:

- current selected level
- C2G entry order
- set-relative level paths

### Right sidebar

Move level metadata back into the right sidebar tab set:

- level metadata
- tile inspector
- selection / shortcuts / other existing board-side info

### Menus

`File`:

- `New`
- `Open`
- `Open Recent`
- `Save Level`
- `Save Set`
- `Download JSON` only if we keep raw JSON workspace export for the active level or set

`Ideas`:

- keep existing walls actions
- add `Edit C2G` here or under `File` depending on final UI fit

My default is `File > Edit C2G`, because it is a manifest/document action rather than an experiment/tool.

## PR Plan

### PR1: C2G parser / serializer core ✅

Add a new `src/c2g/` module in `c2mTools`:

- text loader / serializer
- `game` extraction
- map-bearing statement extraction
- path normalization helpers
- raw preservation model

Tests:

- preserves untouched C2G text when no edits occur
- extracts `map` from bare `map` lines
- extracts `map` from `music ... map ...` lines
- preserves comments and unknown directives verbatim
- treats advanced script/control lines as opaque text

### PR2: Levelset document model and history ✅

Introduce `C2mLevelsetJsonV1` and convert editor state/history/session persistence from single-level to set-level.

Work:

- new levelset schema/types
- history becomes levelset-aware
- persisted editor session becomes levelset-aware
- single `.c2m` still adapts into a one-level set

Tests:

- history undo/redo across level selection + edits
- session serialization round-trip for sets
- one-level adapter behavior

### PR3: Set I/O core ✅

Expand the platform and file-loading layer to support:

- single file
- folder
- zip

Work:

- `OpenedDocumentFile` -> `OpenedDocumentSource`
- browser support:
  - single file input
  - folder picker / `webkitdirectory` fallback
  - zip import using `fflate`
- in-memory folder abstraction for load/save

Tests:

- open single `.c2m` -> one-level set
- open folder with root `.c2g`
- open folder with no `.c2g`
- open zip with nested levels

### PR4: Save Level / Save Set ✅

Split existing save behavior:

- `Save Level` uses current `.c2m` write path for active level
- `Save Set` writes zipped folder with root `.c2g`

Work:

- zip writer
- relative path preservation
- synthesized root C2G when absent
- existing C2G preservation when present

Tests:

- `Save Set` round-trip preserves unknown C2G commands
- reordered levels rewrite C2G map order
- save/open/save is stable for untouched sets

### PR5: DAT-style level manager UI ✅

Migrate `c2mTools` shell to the DATTools level-manager layout.

Work:

- left sidebar `Levels` tab
- add / duplicate / delete / reorder
- selected-level switching
- move current document panel responsibilities into set-level UI

Tests:

- level list reorder updates set order
- add / duplicate / delete update selected level and manifest state

### PR6: Right-sidebar metadata migration

Move level metadata editing out of the left sidebar and into the right sidebar.

Status: done

Work:

- metadata tab in right sidebar
- level-specific inspectors stay level-specific
- left sidebar becomes set-centric

Tests:

- metadata edits apply to selected level only
- switching selected level swaps right-sidebar metadata correctly

### PR7: Raw C2G modal

Add `Edit C2G` raw-text modal.

Work:

- open modal with current raw text
- validate supported pieces on save
- update set name / level order if edited raw text changes them
- preserve untouched unsupported directives

Tests:

- raw edit updates `game`
- raw edit updates level order
- unsupported lines survive byte-for-byte

### PR8: Polish / compat / recent-files

Finish the migration edges:

- recent files become recent sets
- folder/set file naming
- selection reset behavior on level change
- level thumbnails if desired
- documentation

Tests:

- recent set persistence
- default synthesized C2G generation
- save/open across single level, folder, and zip

## Implementation Notes

### Parsing strategy for map order

Do **not** try to interpret all C2G control flow.

Instead:

1. Scan the file as text.
2. Identify map-bearing statements.
3. Group each map-bearing statement into a movable block.
4. Preserve everything else verbatim.

That gives us a safe textual editor for the supported scope.

### Default synthetic C2G

When no C2G exists, synthesize:

```txt
game "Set Name"
map "relative/path/to/level.c2m"
...
```

Synthesized order rule:

- use simple lexicographic order by relative path

### Zip structure

`Save Set` should always emit:

- root C2G
- all referenced `.c2m` files
- nested directories as required by relative paths

Default generated path rule for new or duplicated levels:

- keep filenames in sync with level title and level order
- use a numeric prefix whose width expands with set size
- sanitize the title into a stable slug
- default shape: `014_level_14.c2m`
- when the set grows enough to need more digits, renumber the generated prefixes for the whole set
- preserve existing on-disk relative paths for levels that already came from disk unless the user explicitly renames or reorders into regenerated naming

## Main Risks

1. **Advanced C2G control flow**
   Reordering raw map-entry blocks may not preserve intended scripted semantics.

2. **Path ownership**
   Adding / duplicating / deleting levels means we need deterministic relative path generation.

3. **Browser folder APIs**
   Browser support is weaker than native file APIs, so the platform layer must hide those differences cleanly.

## Resolved Decisions

1. When a folder has **no** `.c2g`, synthesized order is lexicographic by relative path.

2. When the user **adds or duplicates** a level inside a set, default relative paths should track level order and title using sanitized filenames with an automatically expanding numeric prefix width.
   Example: `014_level_14.c2m`.

3. For advanced/scripted C2Gs, the level manager should care only about **textual level order**.
   `Edit C2G` is the escape hatch for anything more complicated.

## Local Code References

- `c2mTools` current shell / open-save flow:
  - `web/src/App.tsx`
  - `web/src/platform/browser.ts`
  - `web/src/platform/types.ts`
- current single-level model:
  - `src/c2m/c2mJsonV1.ts`
  - `web/src/editor/editorHistory.ts`
  - `web/src/persistedAppState.ts`
- DATTools level-manager reference:
  - `DATTools/web/src/App.tsx`
