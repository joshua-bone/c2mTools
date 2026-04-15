# Web App

## Live app

[https://joshua-bone.github.io/c2mTools/](https://joshua-bone.github.io/c2mTools/)

## Run locally

```bash
npm run dev:web
```

The app expects the CC2 spritesheet at `web/public/cc2/spritesheet.png`.

## Editor workflow

The web app is now a board-first `.c2m` editor. The default workflow is:

1. Create a new level or open an existing `.c2m` or JSON file.
2. Edit the board with the palette and board tools.
3. Use the right-side tabs for metadata, resize, modifier-heavy cell edits, and advanced preserved-state inspection.
4. Switch to raw JSON only when you need unsupported fields or manual preservation-sensitive edits.
5. Save back to `.c2m` or download JSON.

## Features

- Create, open, drag/drop, and save `.c2m` files
- Download JSON snapshots
- Board-first editing with:
  - brush
  - line
  - fill
  - erase
  - eyedropper
  - selection
  - copy/paste
  - undo/redo
- Searchable CC2 palette with primary and secondary brushes
- Metadata editing for common top-level fields
- Supported numeric `options.*` editing
- Map resize with `10x10` through `100x100` enforcement
- Modifier-heavy cell editing for:
  - wires
  - tracks
  - logic gates
  - clone arrows
  - letter tiles
  - custom floor/wall styles
  - thin walls / canopy
  - directional blocks
- Rotate/flip transforms
- Advanced raw JSON editing
- Preserved chunk/blob inspection

## Board rules

- Maps are constrained to `10x10` through `100x100`.
- Painting a terrain tile replaces the whole cell.
- Painting a non-terrain item replaces only its logical layer.
- Example: painting a key overwrites force boots but does not overwrite a monster.

## Shortcuts

- `B`, `L`, `F`, `V`, `E`, `I`: switch tools
- `Cmd/Ctrl+Z`: undo
- `Cmd/Ctrl+Shift+Z`: redo
- `Cmd/Ctrl+C`: copy selection
- `Cmd/Ctrl+V`: start paste preview
- `Enter`: commit paste preview
- `Delete`: erase selection
- `Esc`: clear selection or cancel paste
- `Alt` + click: temporary eyedropper
- middle mouse or `Ctrl`/`Cmd` + drag: pan
- mouse wheel: zoom

## Advanced mode and preservation

- Raw JSON remains available as a full editor view.
- Invalid raw JSON does not replace the current in-memory document until parsing succeeds.
- While raw JSON is invalid, visual editing is read-only:
  - board painting
  - metadata apply
  - resize apply
  - modifier-heavy cell edits
- `sections[]`, preserved blobs, and unknown chunks remain part of the round-trip model.

## Known limitations

- Unsupported document fields still require raw JSON editing.
- The cell inspector edits only the modifier-heavy structures currently modeled in the UI.
- The web app does not provide desktop/Tauri packaging.
- This editor preserves structure and fidelity, but it is not a full gameplay-rule validator.

## GitHub Pages deploy

This repo deploys via GitHub Actions. After pushing to `main`, check:

- Actions: the Pages deploy workflow must pass
- Settings → Pages: confirm the published URL
