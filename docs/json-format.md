# JSON Format (schema `c2mTools.c2m.json.v1`)

This project represents `.c2m` files as JSON in a way that supports:

- semantic editing (especially map)
- byte-identical re-emit when unchanged (via `sections[]`)

---

## Top-level shape

```json
{
  "schema": "c2mTools.c2m.json.v1",

  "fileVersion": "7\u0000",
  "lock": "...",
  "title": "...",
  "author": "...",
  "editorVersion": "...",
  "clue": "...",
  "note": "...",

  "options": {
    "time": 400,
    "editorWindow": 0,
    "verifiedReplay": 1,
    "hideMap": 0,
    "readOnlyOption": 0,
    "replayHash": { "encoding": "base64", "dataBase64": "..." },
    "hideLogic": 0,
    "cc1Boots": 0,
    "blobPatterns": 1,
    "extra": { "encoding": "base64", "dataBase64": "..." }
  },

  "readOnlyChunk": true,

  "map": { "...": "see below" },

  "key": { "encoding": "base64", "dataBase64": "..." },
  "replay": { "encoding": "base64", "dataBase64": "..." },

  "sections": [
    { "tag": "TITL", "data": { "encoding": "base64", "dataBase64": "..." } },
    { "tag": "PACK", "data": { "encoding": "base64", "dataBase64": "..." } }
  ],

  "extraChunks": [{ "tag": "XXXX", "data": { "encoding": "base64", "dataBase64": "..." } }]
}
```

### Notes

- Text chunks are represented as strings (decoded from windows-1252).
- `key` and `replay` remain base64 blobs (raw bytes).
- `sections[]` is an ordered list of _all_ chunks (tag + payload bytes).
  - It enables byte-identical output when semantically unchanged.
  - If removed, output will be canonicalized and may not be byte-identical.

---

## `map` (semantic)

The map is:

```json
{
  "width": 32,
  "height": 32,
  "tiles": [
    /* length = width*height, row-major */
  ]
}
```

### TileSpec (Option B)

A tile is either:

1. a string tile name:

```json
"FLOOR"
```

2. or an object with extras:

```json
{
  "tile": "CHIP",
  "dir": "N",
  "lower": "FLOOR"
}
```

Common extra fields:

- `dir`: `"N" | "E" | "S" | "W"`
- `lower`: another TileSpec (recursively)
- `modifiers`: array of Modifier objects
- `thinWallCanopy`: `{ walls: Dir[], canopy: boolean }` (for `THINWALL_CANOPY`)
- `directionalArrows`: `{ arrows: Dir[] }` (for `DIRECTIONAL_BLOCK`)

### Example: a cell with overlays (terrain + mob)

```json
{
  "tile": "CHIP",
  "dir": "E",
  "lower": "FLOOR"
}
```

### Example: thin walls/canopy overlay

```json
{
  "tile": "THINWALL_CANOPY",
  "thinWallCanopy": { "walls": ["N", "E"], "canopy": true },
  "lower": "FLOOR"
}
```

### Example: wired floor (modifier)

```json
{
  "tile": "FLOOR",
  "modifiers": [{ "kind": "WIRES", "wires": ["N", "E"], "tunnels": [] }]
}
```

### Example: railroad track modifier

```json
{
  "tile": "RAILROAD_TRACK",
  "modifiers": [
    {
      "kind": "TRACKS",
      "pieces": ["TURN_SE", "SWITCH"],
      "active": "SE",
      "entered": "N"
    }
  ]
}
```

### Example: custom style

```json
{
  "tile": "CUSTOM_WALL",
  "modifiers": [{ "kind": "CUSTOM_STYLE", "style": "BLUE" }]
}
```

### Modifier kinds (summary)

- `WIRES`: `{ wires: Dir[], tunnels: Dir[] }`
- `TRACKS`: `{ pieces: TrackPiece[], active: TrackActive, entered: Dir }`
- `CLONE_ARROWS`: `{ arrows: Dir[] }`
- `CUSTOM_STYLE`: `{ style: "GREEN"|"PINK"|"YELLOW"|"BLUE" }`
- `LETTER_SYMBOL`: `{ symbol: "↑"|"→"|"↓"|"←"|<ASCII ' '..'_'> }`
- `LOGIC`: `{ gate: ..., facing?: Dir, counterValue?: number }`

Full list and tile naming conventions: [Tile/modifier names](tile-names.md)
