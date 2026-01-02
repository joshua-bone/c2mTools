// src/c2m/transformTool.ts
import path from "node:path";
import { mkdir, readdir, readFile, stat, writeFile, copyFile } from "node:fs/promises";

import type { LevelTransformKind } from "./levelTransform.js";
import { transformLevelJson } from "./levelTransform.js";
import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  stringifyC2mJsonV1,
} from "./c2mJsonV1.js";

export type TransformToolOptions = Readonly<{
  out?: string;
  inPlace?: boolean;
  recursive?: boolean;
  overwrite?: boolean;
  dryRun?: boolean;
  includeJson?: boolean;
  backup?: boolean; // only meaningful with inPlace
}>;

export type TransformSummary = Readonly<{
  processed: number;
  written: number;
  skipped: number;
}>;

export function parseTransformKind(op: string): LevelTransformKind {
  const s = op.trim().toLowerCase().replace(/_/g, "-");

  if (s === "rot90" || s === "rotate90" || s === "rotate-90" || s === "r90") return "ROTATE_90";
  if (s === "rot180" || s === "rotate180" || s === "rotate-180" || s === "r180")
    return "ROTATE_180";
  if (s === "rot270" || s === "rotate270" || s === "rotate-270" || s === "r270")
    return "ROTATE_270";

  if (s === "flip-h" || s === "fliph" || s === "flip-horizontal" || s === "mirror-h")
    return "FLIP_H";
  if (s === "flip-v" || s === "flipv" || s === "flip-vertical" || s === "mirror-v") return "FLIP_V";

  if (s === "flip-nwse" || s === "flip-diag-nwse" || s === "diag-nwse") return "FLIP_DIAG_NWSE";
  if (s === "flip-nesw" || s === "flip-diag-nesw" || s === "diag-nesw") return "FLIP_DIAG_NESW";

  throw new Error(
    `Unknown transform '${op}'. Expected: rot90|rot180|rot270|flip-h|flip-v|flip-nwse|flip-nesw`,
  );
}

function isC2mPath(p: string): boolean {
  return p.toLowerCase().endsWith(".c2m");
}

function isJsonPath(p: string): boolean {
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

function defaultOutFileForFile(inputFile: string, op: string): string {
  const ext = path.extname(inputFile);
  const base = inputFile.slice(0, inputFile.length - ext.length);
  const suffix = op.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${base}.${suffix}${ext}`;
}

function defaultOutDirForDir(inputDir: string, op: string): string {
  const suffix = op.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${inputDir}__${suffix}`;
}

async function readLevelDoc(inputPath: string): Promise<{
  format: "c2m" | "json";
  doc: ReturnType<typeof parseC2mJsonV1>;
}> {
  if (isC2mPath(inputPath)) {
    const bytes = await readFile(inputPath);
    const doc = decodeC2mToJsonV1(bytes);
    return { format: "c2m", doc };
  }

  if (isJsonPath(inputPath)) {
    const text = await readFile(inputPath, "utf8");
    const parsedUnknown: unknown = JSON.parse(text);
    const doc = parseC2mJsonV1(parsedUnknown);
    return { format: "json", doc };
  }

  throw new Error(`Unsupported input extension (expected .c2m or .json): ${inputPath}`);
}

async function writeLevelDoc(
  outputPath: string,
  format: "c2m" | "json",
  doc: ReturnType<typeof parseC2mJsonV1>,
): Promise<void> {
  if (format === "c2m") {
    const bytes = encodeC2mFromJsonV1(doc);
    await writeFile(outputPath, bytes);
    return;
  }

  const text = stringifyC2mJsonV1(doc);
  await writeFile(outputPath, text, "utf8");
}

async function ensureParentDir(p: string): Promise<void> {
  const d = path.dirname(p);
  await mkdir(d, { recursive: true });
}

function inferFormatForDirFile(filePath: string, includeJson: boolean): "c2m" | "json" | null {
  if (isC2mPath(filePath)) return "c2m";
  if (includeJson && isJsonPath(filePath)) return "json";
  return null;
}

export async function runTransformTool(
  opRaw: string,
  inputPath: string,
  opts: TransformToolOptions,
): Promise<TransformSummary> {
  const op = parseTransformKind(opRaw);

  const inIsDir = await isDirectory(inputPath);

  // Normalize options
  const inPlace = opts.inPlace === true;
  const recursive = opts.recursive === true;
  const overwrite = opts.overwrite === true;
  const dryRun = opts.dryRun === true;
  const includeJson = opts.includeJson === true;
  const backup = opts.backup === true;

  let processed = 0;
  let written = 0;
  let skipped = 0;

  if (!inIsDir) {
    const { format, doc } = await readLevelDoc(inputPath);
    const outDoc = transformLevelJson(doc, op);

    let outPath: string;
    if (inPlace) {
      outPath = inputPath;
    } else if (opts.out) {
      const outIsDir = !path.extname(opts.out);
      outPath = outIsDir ? path.join(opts.out, path.basename(inputPath)) : opts.out;
    } else {
      outPath = defaultOutFileForFile(inputPath, opRaw);
    }

    if (!inPlace && !overwrite && (await existsPath(outPath))) {
      console.warn(`Skip (exists): ${outPath}`);
      return { processed: 1, written: 0, skipped: 1 };
    }

    processed++;

    if (dryRun) {
      console.log(`[dry-run] ${inputPath} -> ${outPath}`);
      return { processed, written: 0, skipped: 0 };
    }

    if (inPlace && backup) {
      const bak = `${inputPath}.bak`;
      if (!overwrite && (await existsPath(bak))) {
        throw new Error(`Backup exists (use --overwrite or delete): ${bak}`);
      }
      await copyFile(inputPath, bak);
    }

    await ensureParentDir(outPath);
    await writeLevelDoc(outPath, format, outDoc);
    written++;

    console.log(`${inputPath} -> ${outPath}`);
    return { processed, written, skipped };
  }

  // Directory mode
  const outDir = inPlace ? null : (opts.out ?? defaultOutDirForDir(inputPath, opRaw));
  const outDirAbs = outDir ? path.resolve(outDir) : null;
  const inDirAbs = path.resolve(inputPath);

  if (!inPlace) {
    if (!outDir) throw new Error("Internal error: outDir missing");
    if (!dryRun) await mkdir(outDir, { recursive: true });
  }

  const allFiles = await listFiles(inputPath, recursive);

  for (const f of allFiles) {
    const fmt = inferFormatForDirFile(f, includeJson);
    if (!fmt) continue;

    // If output dir is inside input dir (user chose so), avoid reprocessing output files.
    if (!inPlace && outDirAbs && f.startsWith(outDirAbs + path.sep)) continue;

    processed++;

    const rel = path.relative(inDirAbs, path.resolve(f));
    const dest = inPlace ? f : path.join(outDir as string, rel);

    if (!inPlace && !overwrite && (await existsPath(dest))) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] ${f} -> ${dest}`);
      continue;
    }

    if (inPlace && backup) {
      const bak = `${f}.bak`;
      if (!overwrite && (await existsPath(bak))) {
        throw new Error(`Backup exists (use --overwrite or delete): ${bak}`);
      }
      await copyFile(f, bak);
    }

    const { doc } = await readLevelDoc(f);
    const outDoc = transformLevelJson(doc, op);

    await ensureParentDir(dest);
    await writeLevelDoc(dest, fmt, outDoc);
    written++;
  }

  console.log(
    `Done. processed=${processed} written=${written} skipped=${skipped}` +
      (outDir ? ` out=${outDir}` : " (in-place)"),
  );

  return { processed, written, skipped };
}
