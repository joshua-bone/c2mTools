// src/c2m/render/renderTool.ts
import path from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";

import { decodeC2mToJsonV1, parseC2mJsonV1 } from "../c2mJsonV1.js";
import { CC2Tileset } from "./cc2Tileset.js";
import { CC2Renderer } from "./cc2Renderer.js";
import { applyChromaKeyInPlace, loadPngRgba } from "./png.js";

export type RenderToolOptions = Readonly<{
  tilesetPath: string;
  out?: string;
  recursive?: boolean;
  overwrite?: boolean;
  dryRun?: boolean;
  includeJson?: boolean;
}>;

function isC2m(p: string): boolean {
  return p.toLowerCase().endsWith(".c2m");
}
function isJson(p: string): boolean {
  return p.toLowerCase().endsWith(".json");
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function existsPath(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir: string, recursive: boolean): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...(await listFiles(full, true)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  out.sort();
  return out;
}

function defaultOutFile(inputFile: string): string {
  const ext = path.extname(inputFile);
  const base = inputFile.slice(0, inputFile.length - ext.length);
  return `${base}.png`;
}

function defaultOutDirForDir(inputDir: string): string {
  return `${inputDir}__png`;
}

async function ensureParentDir(p: string): Promise<void> {
  await mkdir(path.dirname(p), { recursive: true });
}

async function readLevelDoc(inputPath: string): Promise<ReturnType<typeof parseC2mJsonV1>> {
  if (isC2m(inputPath)) {
    const bytes = await readFile(inputPath);
    return decodeC2mToJsonV1(bytes);
  }
  if (isJson(inputPath)) {
    const text = await readFile(inputPath, "utf8");
    return parseC2mJsonV1(JSON.parse(text) as unknown);
  }
  throw new Error(`Unsupported input extension: ${inputPath}`);
}

export async function runRenderTool(inputPath: string, opts: RenderToolOptions): Promise<void> {
  const tilesetImg = await loadPngRgba(opts.tilesetPath);
  applyChromaKeyInPlace(tilesetImg);

  const tileset = new CC2Tileset(tilesetImg);
  const renderer = new CC2Renderer(tileset);

  const recursive = opts.recursive === true;
  const overwrite = opts.overwrite === true;
  const dryRun = opts.dryRun === true;
  const includeJson = opts.includeJson === true;

  const inIsDir = await isDirectory(inputPath);

  if (!inIsDir) {
    const doc = await readLevelDoc(inputPath);
    const outPath = opts.out ?? defaultOutFile(inputPath);

    if (!overwrite && (await existsPath(outPath))) {
      console.warn(`Skip (exists): ${outPath}`);
      return;
    }

    if (dryRun) {
      console.log(`[dry-run] ${inputPath} -> ${outPath}`);
      return;
    }

    const png = renderer.renderLevelDocToPng(doc);
    await ensureParentDir(outPath);
    await writeFile(outPath, png);
    console.log(`${inputPath} -> ${outPath}`);
    return;
  }

  const outDir = opts.out ?? defaultOutDirForDir(inputPath);
  if (!dryRun) await mkdir(outDir, { recursive: true });

  const inDirAbs = path.resolve(inputPath);
  const outDirAbs = path.resolve(outDir);

  const files = await listFiles(inputPath, recursive);

  for (const f of files) {
    const isCandidate = isC2m(f) || (includeJson && isJson(f));
    if (!isCandidate) continue;

    // Avoid reprocessing output dir if nested
    if (f.startsWith(outDirAbs + path.sep)) continue;

    const rel = path.relative(inDirAbs, path.resolve(f));
    const dest = path.join(outDir, rel).replace(/\.(c2m|json)$/i, ".png");

    if (!overwrite && (await existsPath(dest))) continue;

    if (dryRun) {
      console.log(`[dry-run] ${f} -> ${dest}`);
      continue;
    }

    const doc = await readLevelDoc(f);
    const png = renderer.renderLevelDocToPng(doc);

    await ensureParentDir(dest);
    await writeFile(dest, png);
  }

  console.log(`Done. out=${outDir}`);
}
