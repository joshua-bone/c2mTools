import type { C2mJsonV1 } from "../c2m/c2mJsonV1.js";
import { parseC2mJsonV1, stringifyC2mJsonV1 } from "../c2m/c2mJsonV1.js";
import {
  createMinimalC2gText,
  normalizeC2gRelativePath,
  parseC2gText,
  serializeC2gText,
  type C2gTextDocument,
} from "./c2gText.js";

export const C2M_LEVELSET_JSON_V1_SCHEMA = "c2mTools.c2g.levelset.json.v1";
export const DEFAULT_C2G_FILE_NAME = "set.c2g";

export type C2mLevelsetEntrySource = "existing" | "generated";

export type C2mLevelsetLevelEntry = Readonly<{
  id: string;
  relativePath: string;
  fileName: string;
  doc: C2mJsonV1;
  warnings?: ReadonlyArray<string>;
  source: C2mLevelsetEntrySource;
}>;

export type C2mLevelsetJsonV1 = Readonly<{
  schema: typeof C2M_LEVELSET_JSON_V1_SCHEMA;
  setName: string;
  c2gFileName: string;
  levels: ReadonlyArray<C2mLevelsetLevelEntry>;
  c2g: C2gTextDocument;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createLevelEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c2g-level-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLevelFileNameFromRelativePath(relativePath: string): string {
  const parts = normalizeC2gRelativePath(relativePath).split("/");
  return parts[parts.length - 1] ?? "level.c2m";
}

function normalizeSetName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Untitled Set";
}

function parseWarnings(value: unknown): ReadonlyArray<string> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Invalid level warnings: expected string array");
  const warnings = value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
  return warnings.length > 0 ? warnings : undefined;
}

function parseC2gTextDocument(value: unknown): C2gTextDocument {
  if (!isRecord(value) || typeof value.rawText !== "string") {
    throw new Error("Invalid levelset.c2g: expected rawText string");
  }
  return parseC2gText(value.rawText);
}

export function createLevelsetEntry(
  doc: C2mJsonV1,
  options: Readonly<{
    id?: string;
    relativePath: string;
    warnings?: ReadonlyArray<string>;
    source?: C2mLevelsetEntrySource;
  }>,
): C2mLevelsetLevelEntry {
  const relativePath = normalizeC2gRelativePath(options.relativePath);
  return {
    id: options.id ?? createLevelEntryId(),
    relativePath,
    fileName: normalizeLevelFileNameFromRelativePath(relativePath),
    doc,
    ...(options.warnings && options.warnings.length > 0 ? { warnings: [...options.warnings] } : {}),
    source: options.source ?? "generated",
  };
}

export function createSingleLevelset(
  doc: C2mJsonV1,
  options: Readonly<{
    fileName?: string | null;
    setName?: string | null;
    c2gFileName?: string | null;
    warnings?: ReadonlyArray<string>;
    source?: C2mLevelsetEntrySource;
  }> = {},
): C2mLevelsetJsonV1 {
  const relativePath = normalizeC2gRelativePath(options.fileName ?? "level.c2m");
  const setName = normalizeSetName(options.setName ?? doc.title ?? null);
  const c2gText = createMinimalC2gText(setName, [relativePath]);
  return {
    schema: C2M_LEVELSET_JSON_V1_SCHEMA,
    setName,
    c2gFileName: options.c2gFileName?.trim() || DEFAULT_C2G_FILE_NAME,
    levels: [
      createLevelsetEntry(doc, {
        relativePath,
        ...(options.warnings ? { warnings: options.warnings } : {}),
        source: options.source ?? "generated",
      }),
    ],
    c2g: parseC2gText(c2gText),
  };
}

export function clampSelectedLevelIndex(
  levelset: C2mLevelsetJsonV1,
  selectedLevelIndex: number,
): number {
  if (levelset.levels.length <= 0) return 0;
  if (!Number.isInteger(selectedLevelIndex)) return 0;
  return Math.max(0, Math.min(selectedLevelIndex, levelset.levels.length - 1));
}

export function getSelectedLevelEntry(
  levelset: C2mLevelsetJsonV1 | null,
  selectedLevelIndex: number,
): C2mLevelsetLevelEntry | null {
  if (!levelset || levelset.levels.length <= 0) return null;
  return levelset.levels[clampSelectedLevelIndex(levelset, selectedLevelIndex)] ?? null;
}

export function replaceLevelsetEntryDoc(
  levelset: C2mLevelsetJsonV1,
  index: number,
  nextDoc: C2mJsonV1,
): C2mLevelsetJsonV1 {
  const selectedIndex = clampSelectedLevelIndex(levelset, index);
  const current = levelset.levels[selectedIndex];
  if (!current) return levelset;

  const levels = [...levelset.levels];
  levels[selectedIndex] = {
    ...current,
    doc: nextDoc,
  };

  return {
    ...levelset,
    levels,
  };
}

export function parseC2mLevelsetJsonV1(input: unknown): C2mLevelsetJsonV1 {
  if (!isRecord(input)) throw new Error("Invalid levelset JSON: expected object");
  if (input.schema !== C2M_LEVELSET_JSON_V1_SCHEMA) throw new Error("Invalid levelset schema");
  if (typeof input.setName !== "string") throw new Error("Invalid levelset setName");
  if (typeof input.c2gFileName !== "string") throw new Error("Invalid levelset c2gFileName");
  if (!Array.isArray(input.levels)) throw new Error("Invalid levelset levels");

  const levels = input.levels.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Invalid levelset level ${index}`);
    if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
      throw new Error(`Invalid levelset level ${index} id`);
    }
    if (typeof entry.relativePath !== "string") {
      throw new Error(`Invalid levelset level ${index} relativePath`);
    }
    if (
      typeof entry.source !== "string" ||
      (entry.source !== "existing" && entry.source !== "generated")
    ) {
      throw new Error(`Invalid levelset level ${index} source`);
    }

    const relativePath = normalizeC2gRelativePath(entry.relativePath);
    const warnings = parseWarnings(entry.warnings);
    return {
      id: entry.id,
      relativePath,
      fileName:
        typeof entry.fileName === "string" && entry.fileName.trim().length > 0
          ? entry.fileName
          : normalizeLevelFileNameFromRelativePath(relativePath),
      doc: parseC2mJsonV1(entry.doc),
      ...(warnings ? { warnings } : {}),
      source: entry.source,
    } satisfies C2mLevelsetLevelEntry;
  });

  return {
    schema: C2M_LEVELSET_JSON_V1_SCHEMA,
    setName: normalizeSetName(input.setName),
    c2gFileName: input.c2gFileName.trim() || DEFAULT_C2G_FILE_NAME,
    levels,
    c2g: parseC2gTextDocument(input.c2g),
  };
}

export function stringifyC2mLevelsetJsonV1(levelset: C2mLevelsetJsonV1): string {
  return (
    JSON.stringify(
      {
        schema: C2M_LEVELSET_JSON_V1_SCHEMA,
        setName: levelset.setName,
        c2gFileName: levelset.c2gFileName,
        levels: levelset.levels.map((level) => ({
          id: level.id,
          relativePath: level.relativePath,
          fileName: level.fileName,
          doc: JSON.parse(stringifyC2mJsonV1(level.doc)),
          ...(level.warnings && level.warnings.length > 0 ? { warnings: [...level.warnings] } : {}),
          source: level.source,
        })),
        c2g: {
          rawText: serializeC2gText(levelset.c2g),
        },
      },
      null,
      2,
    ) + "\n"
  );
}
