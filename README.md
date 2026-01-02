# c2mTools

Tools for working with Chip’s Challenge 2 `.c2m` files:

- Convert `.c2m` ⇄ JSON (schema `c2mTools.c2m.json.v1`)
- Transform levels (rotate/flip) while preserving direction semantics
- Render levels to PNG
- [Web app](https://joshua-bone.github.io/c2mTools/): JSON editor + image view + transform buttons

Deep references:

- [JSON format](docs/json-format.md)
- [Tile/modifier names](docs/tile-names.md)
- [CLI reference](docs/cli.md)
- [Web app reference](docs/web-app.md)
- [Dev setup](docs/dev-setup.md)

---

## Quick Start

### 1) Clone + install

```bash
git clone https://github.com/joshua-bone/c2mTools.git
cd c2mTools
npm ci
```

### 2) Run quality gates (same checks as pre-commit)

```bash
npm run fmt:check
npm run typecheck
npm test
```

### 3) Run the web app (local dev)

Start Vite:

```bash
npm run dev:web
```

Open the URL Vite prints. The app supports:

- Open/drag `.c2m`
- Toggle **JSON** / **Image**
- Apply transforms (rot/flip), with both views updating

### 4) Build + run the CLI

The CLI is exposed as `c2mtools`, but it’s easiest to run via `npm exec`:

```bash
npm run build
npm exec -- c2mtools --help
```

Examples:

```bash
# .c2m -> json
npm exec -- c2mtools to-json fixtures/c2m/001\ -\ Island\ Beginnings.c2m -o /tmp/level.json

# json -> .c2m
npm exec -- c2mtools from-json /tmp/level.json -o /tmp/level.c2m

# transform (writes a copy by default)
npm exec -- c2mtools transform rot90 fixtures/c2m/001\ -\ Island\ Beginnings.c2m

# render a directory to PNGs
npm exec -- c2mtools render fixtures/c2m --tileset assets/cc2/spritesheet.png --out out_pngs --overwrite
```

---

## Hosting the web app on GitHub Pages

This repo is configured to deploy the Vite build via GitHub Actions.

See `docs/web-app.md` for exact steps and troubleshooting.

## License

CC BY 4.0 (Creative Commons Attribution 4.0 International). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
