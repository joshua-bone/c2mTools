import { unzipSync } from "fflate";

import { decodeC2mToJsonV1, parseC2mJsonV1 } from "../../src/c2m/c2mJsonV1.js";
import {
  C2M_LEVELSET_JSON_V1_SCHEMA,
  DEFAULT_C2G_FILE_NAME,
  createLevelsetEntry,
  type C2mLevelsetJsonV1,
} from "../../src/c2g/c2gLevelsetJsonV1.js";
import {
  createMinimalC2gText,
  normalizeC2gRelativePath,
  parseC2gText,
} from "../../src/c2g/c2gText.js";
import type { OpenedDocumentSource, OpenedDocumentSourceEntry } from "./platform/types.js";

export type LoadedDocumentSource = Readonly<{
  levelset: C2mLevelsetJsonV1;
  fileName: string;
  warnings: ReadonlyArray<string>;
}>;

const textDecoder = new TextDecoder();

function resolveLowerExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function normalizeSourceName(name: string): string {
  const trimmed = stripExtension(name).trim();
  return trimmed.length > 0 ? trimmed : "Untitled Set";
}

function stripSingleRootDirectoryPrefix(
  entries: ReadonlyArray<OpenedDocumentSourceEntry>,
): ReadonlyArray<OpenedDocumentSourceEntry> {
  if (entries.length <= 0) return entries;

  const firstParts = entries[0]!.relativePath.split("/");
  if (firstParts.length <= 1) return entries;

  const sharedRoot = firstParts[0]!;
  if (
    sharedRoot.length <= 0 ||
    !entries.every((entry) => {
      const parts = entry.relativePath.split("/");
      return parts.length > 1 && parts[0] === sharedRoot;
    })
  ) {
    return entries;
  }

  return entries.map((entry) => ({
    relativePath: entry.relativePath.slice(sharedRoot.length + 1),
    bytes: entry.bytes,
  }));
}

function sortCollectionEntries(
  entries: ReadonlyArray<OpenedDocumentSourceEntry>,
): OpenedDocumentSourceEntry[] {
  return [...entries].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function decodeC2mEntry(entry: OpenedDocumentSourceEntry, globalWarnings: string[]) {
  const warnings: string[] = [];
  const doc = decodeC2mToJsonV1(entry.bytes, (message) => warnings.push(message));
  for (const warning of warnings) {
    globalWarnings.push(`${entry.relativePath}: ${warning}`);
  }
  return createLevelsetEntry(doc, {
    relativePath: entry.relativePath,
    ...(warnings.length > 0 ? { warnings } : {}),
    source: "existing",
  });
}

function loadSingleFileSource(
  source: Extract<OpenedDocumentSource, { kind: "file" }>,
): LoadedDocumentSource {
  const warnings: string[] = [];
  const extension = resolveLowerExtension(source.name);

  if (extension === ".c2m") {
    const doc = decodeC2mToJsonV1(source.bytes, (message) => warnings.push(message));
    const levelset = {
      schema: C2M_LEVELSET_JSON_V1_SCHEMA,
      setName: doc.title?.trim() || "Untitled Set",
      c2gFileName: DEFAULT_C2G_FILE_NAME,
      levels: [
        createLevelsetEntry(doc, {
          relativePath: normalizeC2gRelativePath(source.name),
          ...(warnings.length > 0 ? { warnings } : {}),
          source: "existing",
        }),
      ],
      c2g: parseC2gText(
        createMinimalC2gText(doc.title?.trim() || "Untitled Set", [
          normalizeC2gRelativePath(source.name),
        ]),
      ),
    } satisfies C2mLevelsetJsonV1;

    return {
      levelset,
      fileName: source.name,
      warnings,
    };
  }

  if (extension === ".json") {
    const parsedDoc = parseC2mJsonV1(JSON.parse(textDecoder.decode(source.bytes)) as unknown);
    const levelset = {
      schema: C2M_LEVELSET_JSON_V1_SCHEMA,
      setName: parsedDoc.title?.trim() || "Untitled Set",
      c2gFileName: DEFAULT_C2G_FILE_NAME,
      levels: [
        createLevelsetEntry(parsedDoc, {
          relativePath: normalizeC2gRelativePath(source.name),
          source: "existing",
        }),
      ],
      c2g: parseC2gText(
        createMinimalC2gText(parsedDoc.title?.trim() || "Untitled Set", [
          normalizeC2gRelativePath(source.name),
        ]),
      ),
    } satisfies C2mLevelsetJsonV1;

    return {
      levelset,
      fileName: source.name,
      warnings,
    };
  }

  if (extension === ".zip") {
    const archiveEntries = stripSingleRootDirectoryPrefix(
      Object.entries(unzipSync(source.bytes))
        .filter(([relativePath]) => !relativePath.endsWith("/"))
        .map(([relativePath, bytes]) => ({
          relativePath,
          bytes,
        })),
    );

    return loadCollectionSource({
      kind: "collection",
      name: normalizeSourceName(source.name),
      entries: archiveEntries,
    });
  }

  throw new Error(`Unsupported document type: ${source.name}`);
}

function buildLevelsetFromEntries(
  collectionName: string,
  c2gFileName: string,
  c2gText: string,
  c2mEntries: ReadonlyArray<OpenedDocumentSourceEntry>,
): LoadedDocumentSource {
  const warnings: string[] = [];
  const c2g = parseC2gText(c2gText);
  const setName = c2g.gameName?.trim() || normalizeSourceName(collectionName);
  const entriesByPath = new Map(c2mEntries.map((entry) => [entry.relativePath, entry] as const));
  const referencedPaths = new Set<string>();
  const levels = [];

  for (const c2gEntry of c2g.entries) {
    const relativePath = normalizeC2gRelativePath(c2gEntry.relativePath);
    referencedPaths.add(relativePath);
    const entry = entriesByPath.get(relativePath);
    if (!entry) {
      warnings.push(`C2G references missing level: ${relativePath}`);
      continue;
    }
    levels.push(decodeC2mEntry(entry, warnings));
  }

  const unreferencedEntries = sortCollectionEntries(
    c2mEntries.filter((entry) => !referencedPaths.has(entry.relativePath)),
  );
  for (const entry of unreferencedEntries) {
    warnings.push(
      `Level not referenced by ${c2gFileName}; appended after referenced levels: ${entry.relativePath}`,
    );
    levels.push(decodeC2mEntry(entry, warnings));
  }

  if (levels.length <= 0) {
    throw new Error("The opened set did not contain any loadable .c2m levels.");
  }

  return {
    levelset: {
      schema: C2M_LEVELSET_JSON_V1_SCHEMA,
      setName,
      c2gFileName,
      levels,
      c2g,
    },
    fileName: collectionName,
    warnings,
  };
}

function loadCollectionSource(
  source: Extract<OpenedDocumentSource, { kind: "collection" }>,
): LoadedDocumentSource {
  const normalizedEntries = sortCollectionEntries(
    source.entries
      .map((entry) => ({
        relativePath: normalizeC2gRelativePath(entry.relativePath),
        bytes: entry.bytes,
      }))
      .filter((entry) => !entry.relativePath.startsWith("__MACOSX/")),
  );

  const c2mEntries = normalizedEntries.filter(
    (entry) => resolveLowerExtension(entry.relativePath) === ".c2m",
  );
  if (c2mEntries.length <= 0) {
    throw new Error("The opened folder or archive does not contain any .c2m levels.");
  }

  const c2gEntries = normalizedEntries.filter(
    (entry) => resolveLowerExtension(entry.relativePath) === ".c2g",
  );

  if (c2gEntries.length >= 1) {
    const c2gEntry = c2gEntries[0]!;
    const warnings =
      c2gEntries.length > 1 ? [`Multiple .c2g files found; using ${c2gEntry.relativePath}.`] : [];
    const loaded = buildLevelsetFromEntries(
      source.name,
      c2gEntry.relativePath,
      textDecoder.decode(c2gEntry.bytes),
      c2mEntries,
    );
    return warnings.length > 0
      ? {
          ...loaded,
          warnings: [...warnings, ...loaded.warnings],
        }
      : loaded;
  }

  const setName = normalizeSourceName(source.name);
  const c2gText = createMinimalC2gText(
    setName,
    c2mEntries.map((entry) => entry.relativePath),
  );
  const warnings = [`No root .c2g found; synthesized ${DEFAULT_C2G_FILE_NAME}.`];
  const levels = c2mEntries.map((entry) => decodeC2mEntry(entry, warnings));

  return {
    levelset: {
      schema: C2M_LEVELSET_JSON_V1_SCHEMA,
      setName,
      c2gFileName: DEFAULT_C2G_FILE_NAME,
      levels,
      c2g: parseC2gText(c2gText),
    },
    fileName: source.name,
    warnings,
  };
}

export function loadLevelsetFromOpenedDocumentSource(
  source: OpenedDocumentSource,
): LoadedDocumentSource {
  return source.kind === "file" ? loadSingleFileSource(source) : loadCollectionSource(source);
}
