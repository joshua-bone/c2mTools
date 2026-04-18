import { zipSync } from "fflate";

import { encodeC2mFromJsonV1 } from "../../src/c2m/c2mJsonV1.js";
import { rewriteC2gTextDocument, serializeC2gText } from "../../src/c2g/c2gText.js";
import type { C2mLevelsetJsonV1 } from "../../src/c2g/c2gLevelsetJsonV1.js";

export type SavedLevelsetArchive = Readonly<{
  fileName: string;
  bytes: Uint8Array;
  c2gText: string;
}>;

function trimFileName(fileName: string | null | undefined): string {
  return typeof fileName === "string" ? fileName.trim() : "";
}

function slugifyFileStem(value: string | null | undefined): string {
  const normalized = trimFileName(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  return normalized.length > 0 ? normalized : "set";
}

function normalizeZipFileName(value: string | null | undefined): string {
  const trimmed = trimFileName(value);
  if (trimmed.length === 0) return "set.zip";
  return trimmed.toLowerCase().endsWith(".zip") ? trimmed : `${trimmed}.zip`;
}

function normalizeC2gFileName(value: string | null | undefined): string {
  const trimmed = trimFileName(value);
  if (trimmed.length === 0) return "set.c2g";
  return trimmed.toLowerCase().endsWith(".c2g") ? trimmed : `${trimmed}.c2g`;
}

export function buildSavedLevelsetArchive(levelset: C2mLevelsetJsonV1): SavedLevelsetArchive {
  const rewrittenC2g = rewriteC2gTextDocument(levelset.c2g, {
    gameName: levelset.setName,
    entryRelativePaths: levelset.levels.map((level) => level.relativePath),
  });
  const c2gText = serializeC2gText(rewrittenC2g);
  const archiveEntries: Record<string, Uint8Array> = {
    [normalizeC2gFileName(levelset.c2gFileName)]: new TextEncoder().encode(c2gText),
  };

  for (const level of levelset.levels) {
    archiveEntries[level.relativePath] = encodeC2mFromJsonV1(level.doc);
  }

  return {
    fileName: normalizeZipFileName(slugifyFileStem(levelset.setName)),
    bytes: zipSync(archiveEntries, { level: 0 }),
    c2gText,
  };
}
