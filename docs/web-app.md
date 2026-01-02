# Web App

## GitHub Pages

[https://joshua-bone.github.io/c2mTools/](https://joshua-bone.github.io/c2mTools/)

## Run locally

Start the dev server:

```bash
npm run dev:web
```

## Features

- Open/drag `.c2m`
- View modes: **JSON** and **Image**
- Apply transforms (rot/flip). Both views update.
- Save JSON back to `.c2m`

## GitHub Pages deploy

This repo deploys via GitHub Actions. After pushing to `main`, check:

- Actions → the Pages deploy workflow run must be green
- Settings → Pages → it will display the live URL
