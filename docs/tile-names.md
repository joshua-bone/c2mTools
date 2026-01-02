# Tile and Modifier Names

This repo uses **stable string names** for tiles and modifiers in map JSON.
Tile specs are Option B:

- `"FLOOR"` (string) for a plain tile
- `{ "tile": "CHIP", "dir": "N", "lower": "FLOOR" }` when extra data exists

---

## Tile names

Tile names match the [CC2 wiki table](https://wiki.bitbusters.club/C2M) (see map decoding).
The full mapping is implemented in [src/c2m/mapCodec.ts](../src/c2m/mapCodec.ts) as `TILE_NAME_BY_ID` and includes `UNUSED_*` and modifier wrapper codes.

Examples:

- `FLOOR`, `WALL`, `WATER`, `FIRE`
- `FORCE_N`, `FORCE_E`, `FORCE_S`, `FORCE_W`, `FORCE_RANDOM`
- `ICE_CORNER_NE`, `ICE_CORNER_NW`, `ICE_CORNER_SE`, `ICE_CORNER_SW`
- `CHIP`, `MELINDA`
- `SWIVEL_DOOR_NE`, `SWIVEL_DOOR_NW`, `SWIVEL_DOOR_SE`, `SWIVEL_DOOR_SW`
- `CUSTOM_FLOOR`, `CUSTOM_WALL`
- `RAILROAD_TRACK`
- `LOGIC_GATE`
- `LETTER_TILE`
- `THINWALL_CANOPY`
- `DIRECTIONAL_BLOCK`

Unknown tiles are represented as:

- `UNKNOWN_0xNN` (hex byte)

---

## Modifier names and fields

### `WIRES`

Applies to tiles like `FLOOR`, `RED_TELEPORT`, `BLUE_TELEPORT`, `STEEL_WALL`, switches.

```json
{ "kind": "WIRES", "wires": ["N", "E"], "tunnels": ["S"] }
```

### `TRACKS`

Applies to `RAILROAD_TRACK`.

```json
{
  "kind": "TRACKS",
  "pieces": ["TURN_NE", "HORIZONTAL", "SWITCH"],
  "active": "H",
  "entered": "W"
}
```

- `pieces`: includes `TURN_NE|TURN_SE|TURN_SW|TURN_NW|HORIZONTAL|VERTICAL|SWITCH`
- `active`: `NE|SE|SW|NW|H|V`
- `entered`: `N|E|S|W`

### `CLONE_ARROWS`

Applies to `CLONE_MACHINE`.

```json
{ "kind": "CLONE_ARROWS", "arrows": ["N", "W"] }
```

### `CUSTOM_STYLE`

Applies to `CUSTOM_FLOOR` and `CUSTOM_WALL`.

```json
{ "kind": "CUSTOM_STYLE", "style": "BLUE" }
```

### `LETTER_SYMBOL`

Applies to `LETTER_TILE`.

```json
{ "kind": "LETTER_SYMBOL", "symbol": "A" }
```

Allowed:

- arrows: `↑ → ↓ ←`
- ASCII characters `' '` through `'_'` (0x20..0x5F)

### `LOGIC`

Applies to `LOGIC_GATE`.

```json
{ "kind": "LOGIC", "gate": "AND", "facing": "E" }
```

Or counter:

```json
{ "kind": "LOGIC", "gate": "COUNTER", "counterValue": 7 }
```

---

## Transform semantics

Transforms rotate/flip:

- all `dir` fields
- all direction lists inside modifiers (`WIRES`, `CLONE_ARROWS`, `TRACKS.entered`)
- track orientation (`HORIZONTAL`↔`VERTICAL`, `active: H↔V`) where axes swap
- corner track pieces (`TURN_NE` etc) and corner actives (`NE` etc)

See [src/c2m/levelTransform.ts](../src/c2m/levelTransform.ts) for the authoritative transform rules.
