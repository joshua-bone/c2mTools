import { decodeC2mToJsonV1, encodeC2mFromJsonV1, type C2mJsonV1 } from "../../src/c2m/c2mJsonV1.js";

export const RECENT_LEVELS_STORAGE_KEY = "c2mtools-recent-levels";

const PERSISTED_RECENT_LEVELS_SCHEMA = "c2mTools.web.recentLevels.v1";

export type PersistedRecentLevelEntry = Readonly<{
  id: string;
  fileName: string;
  title: string;
  updatedAt: number;
  width: number | null;
  height: number | null;
  thumbnailDataUrl: string | null;
  encodedC2mBase64: string;
}>;

export type DecodedRecentLevelEntry = Readonly<{
  doc: C2mJsonV1;
  fileName: string;
  warnings: ReadonlyArray<string>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function bytesFromBase64(dataBase64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(dataBase64, "base64"));
}

function normalizeLevelTitle(doc: C2mJsonV1): string {
  return doc.title?.trim() || "Untitled Level";
}

export function createRecentLevelId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `recent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPersistedRecentLevelEntry(
  options: Readonly<{
    id: string;
    doc: C2mJsonV1;
    fileName: string;
    thumbnailDataUrl?: string | null;
    updatedAt?: number;
  }>,
): PersistedRecentLevelEntry {
  return {
    id: options.id,
    fileName: options.fileName,
    title: normalizeLevelTitle(options.doc),
    updatedAt: options.updatedAt ?? Date.now(),
    width: options.doc.map?.width ?? null,
    height: options.doc.map?.height ?? null,
    thumbnailDataUrl: options.thumbnailDataUrl ?? null,
    encodedC2mBase64: bytesToBase64(encodeC2mFromJsonV1(options.doc)),
  };
}

export function decodePersistedRecentLevelEntry(
  entry: PersistedRecentLevelEntry,
): DecodedRecentLevelEntry {
  const warnings: string[] = [];
  const doc = decodeC2mToJsonV1(bytesFromBase64(entry.encodedC2mBase64), (message) =>
    warnings.push(message),
  );

  return {
    doc,
    fileName: entry.fileName,
    warnings,
  };
}

export function findMatchingRecentLevelId(
  entries: ReadonlyArray<PersistedRecentLevelEntry>,
  doc: C2mJsonV1,
  fileName: string,
): string | null {
  const encodedC2mBase64 = bytesToBase64(encodeC2mFromJsonV1(doc));
  const match = entries.find(
    (entry) => entry.fileName === fileName && entry.encodedC2mBase64 === encodedC2mBase64,
  );
  return match?.id ?? null;
}

export function upsertRecentLevelEntry(
  entries: ReadonlyArray<PersistedRecentLevelEntry>,
  nextEntry: PersistedRecentLevelEntry,
): PersistedRecentLevelEntry[] {
  return [
    nextEntry,
    ...entries
      .filter((entry) => entry.id !== nextEntry.id)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)),
  ];
}

export function removeRecentLevelEntry(
  entries: ReadonlyArray<PersistedRecentLevelEntry>,
  id: string,
): PersistedRecentLevelEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function parsePersistedRecentLevels(value: string | null): PersistedRecentLevelEntry[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed) || parsed.schema !== PERSISTED_RECENT_LEVELS_SCHEMA) return [];
    if (!Array.isArray(parsed.entries)) return [];

    return parsed.entries.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      if (typeof entry.id !== "string" || entry.id.trim().length === 0) return [];
      if (typeof entry.fileName !== "string" || entry.fileName.trim().length === 0) return [];
      if (typeof entry.title !== "string" || entry.title.trim().length === 0) return [];
      if (typeof entry.updatedAt !== "number" || !Number.isFinite(entry.updatedAt)) return [];
      if (entry.width !== null && (typeof entry.width !== "number" || entry.width < 0)) return [];
      if (entry.height !== null && (typeof entry.height !== "number" || entry.height < 0))
        return [];
      if (entry.thumbnailDataUrl !== null && typeof entry.thumbnailDataUrl !== "string") return [];
      if (
        typeof entry.encodedC2mBase64 !== "string" ||
        entry.encodedC2mBase64.trim().length === 0
      ) {
        return [];
      }

      return [
        {
          id: entry.id,
          fileName: entry.fileName,
          title: entry.title,
          updatedAt: entry.updatedAt,
          width: entry.width,
          height: entry.height,
          thumbnailDataUrl: entry.thumbnailDataUrl,
          encodedC2mBase64: entry.encodedC2mBase64,
        } satisfies PersistedRecentLevelEntry,
      ];
    });
  } catch {
    return [];
  }
}

export function serializePersistedRecentLevels(
  entries: ReadonlyArray<PersistedRecentLevelEntry>,
): string {
  return JSON.stringify({
    schema: PERSISTED_RECENT_LEVELS_SCHEMA,
    entries,
  });
}
