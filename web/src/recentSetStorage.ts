import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../../src/c2m/c2mJsonV1.js";
import {
  clampSelectedLevelIndex,
  createSingleLevelset,
  getSelectedLevelEntry,
  parseC2mLevelsetJsonV1,
  stringifyC2mLevelsetJsonV1,
  type C2mLevelsetJsonV1,
} from "../../src/c2g/c2gLevelsetJsonV1.js";
import { compressStoredJson, decompressStoredJson } from "./storageCompression.js";

export const RECENT_SETS_STORAGE_KEY = "c2mtools-recent-levels";

const PERSISTED_RECENT_SETS_SCHEMA = "c2mTools.web.recentSets.v1";
const LEGACY_PERSISTED_RECENT_LEVELS_SCHEMA = "c2mTools.web.recentLevels.v1";

export type PersistedRecentSetEntry = Readonly<{
  id: string;
  fileName: string;
  title: string;
  updatedAt: number;
  levelCount: number;
  selectedLevelIndex: number;
  selectedLevelTitle: string;
  width: number | null;
  height: number | null;
  thumbnailDataUrl: string | null;
  levelsetJsonGzipBase64: string;
}>;

export type DecodedRecentSetEntry = Readonly<{
  levelset: C2mLevelsetJsonV1;
  fileName: string;
  selectedLevelIndex: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bytesFromBase64(dataBase64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(dataBase64, "base64"));
}

function encodeStoredLevelset(levelset: C2mLevelsetJsonV1): string {
  return compressStoredJson(stringifyC2mLevelsetJsonV1(levelset));
}

function decodeStoredLevelset(dataBase64: string): C2mLevelsetJsonV1 {
  return parseC2mLevelsetJsonV1(JSON.parse(decompressStoredJson(dataBase64)) as unknown);
}

function normalizeSetTitle(levelset: C2mLevelsetJsonV1): string {
  const trimmed = levelset.setName.trim();
  return trimmed.length > 0 ? trimmed : "Untitled Set";
}

function resolveSelectedLevelMetadata(
  levelset: C2mLevelsetJsonV1,
  selectedLevelIndex: number,
): Readonly<{
  selectedLevelIndex: number;
  selectedLevelTitle: string;
  width: number | null;
  height: number | null;
}> {
  const nextSelectedLevelIndex = clampSelectedLevelIndex(levelset, selectedLevelIndex);
  const selectedLevelEntry = getSelectedLevelEntry(levelset, nextSelectedLevelIndex);
  return {
    selectedLevelIndex: nextSelectedLevelIndex,
    selectedLevelTitle: selectedLevelEntry?.doc.title?.trim() || "Untitled Level",
    width: selectedLevelEntry?.doc.map?.width ?? null,
    height: selectedLevelEntry?.doc.map?.height ?? null,
  };
}

function migrateLegacyRecentLevelEntry(
  entry: Record<string, unknown>,
): PersistedRecentSetEntry | null {
  if (typeof entry.id !== "string" || entry.id.trim().length === 0) return null;
  if (typeof entry.fileName !== "string" || entry.fileName.trim().length === 0) return null;
  if (typeof entry.updatedAt !== "number" || !Number.isFinite(entry.updatedAt)) return null;
  if (typeof entry.encodedC2mBase64 !== "string" || entry.encodedC2mBase64.trim().length === 0) {
    return null;
  }

  try {
    const warnings: string[] = [];
    const doc = decodeC2mToJsonV1(bytesFromBase64(entry.encodedC2mBase64), (message) =>
      warnings.push(message),
    );
    const levelset = createSingleLevelset(doc, {
      fileName: entry.fileName,
      source: "existing",
      ...(warnings.length > 0 ? { warnings } : {}),
    });
    return createPersistedRecentSetEntry({
      id: entry.id,
      levelset,
      fileName: entry.fileName,
      selectedLevelIndex: 0,
      thumbnailDataUrl: typeof entry.thumbnailDataUrl === "string" ? entry.thumbnailDataUrl : null,
      updatedAt: entry.updatedAt,
    });
  } catch {
    return null;
  }
}

export function createRecentSetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `recent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPersistedRecentSetEntry(
  options: Readonly<{
    id: string;
    levelset: C2mLevelsetJsonV1;
    fileName: string;
    selectedLevelIndex: number;
    thumbnailDataUrl?: string | null;
    updatedAt?: number;
  }>,
): PersistedRecentSetEntry {
  const selectedLevelMetadata = resolveSelectedLevelMetadata(
    options.levelset,
    options.selectedLevelIndex,
  );
  return {
    id: options.id,
    fileName: options.fileName,
    title: normalizeSetTitle(options.levelset),
    updatedAt: options.updatedAt ?? Date.now(),
    levelCount: options.levelset.levels.length,
    selectedLevelIndex: selectedLevelMetadata.selectedLevelIndex,
    selectedLevelTitle: selectedLevelMetadata.selectedLevelTitle,
    width: selectedLevelMetadata.width,
    height: selectedLevelMetadata.height,
    thumbnailDataUrl: options.thumbnailDataUrl ?? null,
    levelsetJsonGzipBase64: encodeStoredLevelset(options.levelset),
  };
}

export function decodePersistedRecentSetEntry(
  entry: PersistedRecentSetEntry,
): DecodedRecentSetEntry {
  const levelset = decodeStoredLevelset(entry.levelsetJsonGzipBase64);
  return {
    levelset,
    fileName: entry.fileName,
    selectedLevelIndex: clampSelectedLevelIndex(levelset, entry.selectedLevelIndex),
  };
}

export function findMatchingRecentSetId(
  entries: ReadonlyArray<PersistedRecentSetEntry>,
  levelset: C2mLevelsetJsonV1,
  fileName: string,
): string | null {
  const levelsetJsonGzipBase64 = encodeStoredLevelset(levelset);
  const match = entries.find(
    (entry) =>
      entry.fileName === fileName && entry.levelsetJsonGzipBase64 === levelsetJsonGzipBase64,
  );
  return match?.id ?? null;
}

export function upsertRecentSetEntry(
  entries: ReadonlyArray<PersistedRecentSetEntry>,
  nextEntry: PersistedRecentSetEntry,
): PersistedRecentSetEntry[] {
  return [
    nextEntry,
    ...entries
      .filter((entry) => entry.id !== nextEntry.id)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)),
  ];
}

export function removeRecentSetEntry(
  entries: ReadonlyArray<PersistedRecentSetEntry>,
  id: string,
): PersistedRecentSetEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function parsePersistedRecentSets(value: string | null): PersistedRecentSetEntry[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) return [];
    if (!Array.isArray(parsed.entries)) return [];

    if (parsed.schema === LEGACY_PERSISTED_RECENT_LEVELS_SCHEMA) {
      return parsed.entries.flatMap((entry) =>
        isRecord(entry)
          ? ([migrateLegacyRecentLevelEntry(entry)].filter(Boolean) as PersistedRecentSetEntry[])
          : [],
      );
    }

    if (parsed.schema !== PERSISTED_RECENT_SETS_SCHEMA) return [];

    return parsed.entries.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      if (typeof entry.id !== "string" || entry.id.trim().length === 0) return [];
      if (typeof entry.fileName !== "string" || entry.fileName.trim().length === 0) return [];
      if (typeof entry.title !== "string" || entry.title.trim().length === 0) return [];
      if (typeof entry.updatedAt !== "number" || !Number.isFinite(entry.updatedAt)) return [];
      if (
        typeof entry.levelCount !== "number" ||
        !Number.isFinite(entry.levelCount) ||
        entry.levelCount < 1
      )
        return [];
      if (
        typeof entry.selectedLevelIndex !== "number" ||
        !Number.isFinite(entry.selectedLevelIndex) ||
        entry.selectedLevelIndex < 0
      ) {
        return [];
      }
      if (
        typeof entry.selectedLevelTitle !== "string" ||
        entry.selectedLevelTitle.trim().length === 0
      ) {
        return [];
      }
      if (entry.width !== null && (typeof entry.width !== "number" || entry.width < 0)) return [];
      if (entry.height !== null && (typeof entry.height !== "number" || entry.height < 0))
        return [];
      if (entry.thumbnailDataUrl !== null && typeof entry.thumbnailDataUrl !== "string") return [];
      const levelsetJsonGzipBase64 =
        typeof entry.levelsetJsonGzipBase64 === "string" &&
        entry.levelsetJsonGzipBase64.trim().length > 0
          ? entry.levelsetJsonGzipBase64
          : typeof entry.levelsetJson === "string" && entry.levelsetJson.trim().length > 0
            ? compressStoredJson(entry.levelsetJson)
            : null;
      if (!levelsetJsonGzipBase64) return [];

      try {
        const levelset = decodeStoredLevelset(levelsetJsonGzipBase64);
        const selectedLevelMetadata = resolveSelectedLevelMetadata(
          levelset,
          entry.selectedLevelIndex,
        );
        return [
          {
            id: entry.id,
            fileName: entry.fileName,
            title: entry.title,
            updatedAt: entry.updatedAt,
            levelCount: levelset.levels.length,
            selectedLevelIndex: selectedLevelMetadata.selectedLevelIndex,
            selectedLevelTitle: selectedLevelMetadata.selectedLevelTitle,
            width: selectedLevelMetadata.width,
            height: selectedLevelMetadata.height,
            thumbnailDataUrl: entry.thumbnailDataUrl,
            levelsetJsonGzipBase64: encodeStoredLevelset(levelset),
          } satisfies PersistedRecentSetEntry,
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function serializePersistedRecentSets(
  entries: ReadonlyArray<PersistedRecentSetEntry>,
): string {
  return JSON.stringify({
    schema: PERSISTED_RECENT_SETS_SCHEMA,
    entries,
  });
}
