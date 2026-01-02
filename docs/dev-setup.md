# Dev setup

## Requirements

- Node.js (LTS)
- npm (comes with Node)
- Git

## Install

```bash
npm ci
```

## Pre-commit gates

This repo blocks `git commit` when any of these fail:

- Prettier formatting check
- TypeScript typecheck (root + web)
- Vitest tests

Run locally:

```bash
npm run fmt:check
npm run typecheck
npm test
```

Auto-format:

```bash
npm run fmt:write
```

## Common workflows

### Run unit tests

```bash
npm test
```

### Typecheck

```bash
npm run typecheck
```

### Build CLI

```bash
npm run build
```

### Run web app

```bash
npm run dev:web
```

### Build web app

```bash
npm run build:web
```

## Repo layout (high level)

- `src/cli.ts` — CLI entry
- `src/c2m/` — codecs, transforms, renderer
- `web/` — Vite + React app (root is `web/`)
- `fixtures/c2m/` — round-trip fixtures
- `docs/` — documentation
