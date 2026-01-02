# CLI Reference

All CLI examples assume you’ve built first:

```bash
npm run build
```

Run via:

```bash
npm exec -- c2mtools <command> ...
```

(Alternative: `node dist/cli.js <command> ...`)

---

## `to-json`

Convert `.c2m` → JSON on stdout (or `-o` to write a file).

```bash
npm exec -- c2mtools to-json path/to/level.c2m
npm exec -- c2mtools to-json path/to/level.c2m -o level.json
```

Notes:

- PACK maps are unpacked and parsed into semantic JSON.
- `sections[]` is included to preserve byte-identical round-trip (see JSON docs).

---

## `from-json`

Convert JSON → `.c2m`.

```bash
npm exec -- c2mtools from-json level.json -o out.c2m
```

Notes:

- If `sections[]` is present, output preserves original chunk order and payloads wherever semantically unchanged.
- END is always written as `END ` + 4-byte length (0), per spec.

---

## `transform`

Apply geometric transforms (file or folder). Defaults to making copies.

Operations:

- `rot90`, `rot180`, `rot270`
- `flip-h`, `flip-v`
- `flip-nwse` (main diagonal), `flip-nesw` (anti-diagonal)

Examples:

```bash
# single file -> copy next to input (suffix added)
npm exec -- c2mtools transform rot90 level.c2m

# single file -> explicit output path
npm exec -- c2mtools transform flip-h level.c2m --out out/level.c2m

# directory -> output dir
npm exec -- c2mtools transform rot180 fixtures/c2m --out fixtures/c2m_rot180

# in-place (danger), with backups
npm exec -- c2mtools transform flip-v fixtures/c2m --in-place --backup
```

Flags:

- `--out <path>` output file (single input) or directory (dir input)
- `--in-place` overwrite inputs
- `--backup` write `*.bak` before overwriting (in-place only)
- `--recursive` recurse into subdirectories (dir input)
- `--include-json` also process `.json` files (dir input)
- `--overwrite` overwrite existing outputs (non-in-place)
- `--dry-run` print actions, write nothing

---

## `render`

Render `.c2m`/`.json` into PNG(s).

Spritesheet:

- CLI expects a tileset at `--tileset <path>`
- Recommended location: `assets/cc2/spritesheet.png`

Examples:

```bash
# one file -> level.png next to it
npm exec -- c2mtools render level.c2m --tileset assets/cc2/spritesheet.png

# one file -> explicit output
npm exec -- c2mtools render level.c2m --tileset assets/cc2/spritesheet.png --out out/level.png

# directory -> out dir
npm exec -- c2mtools render fixtures/c2m --tileset assets/cc2/spritesheet.png --out out_pngs --overwrite
```

Renderer rules (summary):

- 32x32 tiles, chroma-key transparency from pixel (0,0)
- Layer order: terrain → sob → no-sign → mob → swivel overlay → thin walls
- See `docs/web-app.md` for where the web app expects the spritesheet.
