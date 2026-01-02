import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function resolveJsToTsForLocalSources(): Plugin {
  return {
    name: "resolve-js-to-ts-for-local-sources",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      if (!source.startsWith(".")) return null;
      if (!source.endsWith(".js")) return null;

      const importerPath = importer.split("?", 1)[0] ?? importer;
      const sourcePath = source.split("?", 1)[0] ?? source;

      const absJs = path.resolve(path.dirname(importerPath), sourcePath);
      if (!absJs.endsWith(".js")) return null;

      const absTs = absJs.slice(0, -3) + ".ts";
      const absTsx = absJs.slice(0, -3) + ".tsx";

      if (fs.existsSync(absTs)) return absTs;
      if (fs.existsSync(absTsx)) return absTsx;

      return null;
    },
  };
}

export default defineConfig({
  root: "web",
  plugins: [react(), resolveJsToTsForLocalSources()],
  server: {
    fs: {
      allow: [".."], // allow importing ../src/* from web/*
    },
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
});
