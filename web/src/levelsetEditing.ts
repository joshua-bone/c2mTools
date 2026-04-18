import type { C2mJsonV1 } from "../../src/c2m/c2mJsonV1.js";
import {
  createLevelsetEntry,
  type C2mLevelsetJsonV1,
  type C2mLevelsetLevelEntry,
} from "../../src/c2g/c2gLevelsetJsonV1.js";
import { createEmptyC2mDoc } from "./editor/createEmptyC2mDoc.js";

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isInteger(index)) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

function slugifyLevelTitle(title: string | null | undefined): string {
  const normalized = (title ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  return normalized.length > 0 ? normalized : "untitled_level";
}

function createGeneratedRelativePath(
  index: number,
  levelCount: number,
  title: string | null | undefined,
): string {
  const digits = Math.max(1, String(Math.max(levelCount, 1)).length);
  const prefix = String(index + 1).padStart(digits, "0");
  return `${prefix}_${slugifyLevelTitle(title)}.c2m`;
}

function updateEntryRelativePath(
  entry: C2mLevelsetLevelEntry,
  relativePath: string,
): C2mLevelsetLevelEntry {
  const slashIndex = relativePath.lastIndexOf("/");
  return {
    ...entry,
    relativePath,
    fileName: slashIndex >= 0 ? relativePath.slice(slashIndex + 1) : relativePath,
  };
}

export function resequenceGeneratedLevelEntries(levelset: C2mLevelsetJsonV1): C2mLevelsetJsonV1 {
  const levels = levelset.levels.map((entry, index) =>
    entry.source === "generated"
      ? updateEntryRelativePath(
          entry,
          createGeneratedRelativePath(index, levelset.levels.length, entry.doc.title),
        )
      : entry,
  );

  return {
    ...levelset,
    levels,
  };
}

function buildNewLevelDoc(title: string): C2mJsonV1 {
  return {
    ...createEmptyC2mDoc(),
    title,
  };
}

export function addLevelAfterSelection(
  levelset: C2mLevelsetJsonV1,
  selectedLevelIndex: number,
): Readonly<{
  levelset: C2mLevelsetJsonV1;
  selectedLevelIndex: number;
}> {
  const insertIndex = Math.min(
    clampIndex(selectedLevelIndex, Math.max(levelset.levels.length, 1)) + 1,
    levelset.levels.length,
  );
  const nextTitle = `Level ${levelset.levels.length + 1}`;
  const nextLevels = [...levelset.levels];
  nextLevels.splice(
    insertIndex,
    0,
    createLevelsetEntry(buildNewLevelDoc(nextTitle), {
      relativePath: createGeneratedRelativePath(insertIndex, levelset.levels.length + 1, nextTitle),
      source: "generated",
    }),
  );

  return {
    levelset: resequenceGeneratedLevelEntries({
      ...levelset,
      levels: nextLevels,
    }),
    selectedLevelIndex: insertIndex,
  };
}

export function duplicateLevelAtIndex(
  levelset: C2mLevelsetJsonV1,
  index: number,
): Readonly<{
  levelset: C2mLevelsetJsonV1;
  selectedLevelIndex: number;
}> {
  if (levelset.levels.length <= 0) {
    return addLevelAfterSelection(levelset, 0);
  }

  const sourceIndex = clampIndex(index, levelset.levels.length);
  const source = levelset.levels[sourceIndex]!;
  const insertIndex = sourceIndex + 1;
  const nextLevels = [...levelset.levels];
  nextLevels.splice(
    insertIndex,
    0,
    createLevelsetEntry(source.doc, {
      relativePath: createGeneratedRelativePath(
        insertIndex,
        levelset.levels.length + 1,
        source.doc.title,
      ),
      ...(source.warnings ? { warnings: source.warnings } : {}),
      source: "generated",
    }),
  );

  return {
    levelset: resequenceGeneratedLevelEntries({
      ...levelset,
      levels: nextLevels,
    }),
    selectedLevelIndex: insertIndex,
  };
}

export function deleteLevelAtIndex(
  levelset: C2mLevelsetJsonV1,
  index: number,
): Readonly<{
  levelset: C2mLevelsetJsonV1;
  selectedLevelIndex: number;
}> {
  if (levelset.levels.length <= 1) {
    return {
      levelset,
      selectedLevelIndex: 0,
    };
  }

  const deleteIndex = clampIndex(index, levelset.levels.length);
  const nextLevels = levelset.levels.filter((_, currentIndex) => currentIndex !== deleteIndex);
  const nextSelectedLevelIndex = Math.min(deleteIndex, nextLevels.length - 1);

  return {
    levelset: resequenceGeneratedLevelEntries({
      ...levelset,
      levels: nextLevels,
    }),
    selectedLevelIndex: nextSelectedLevelIndex,
  };
}

export function moveLevelToIndex(
  levelset: C2mLevelsetJsonV1,
  fromIndex: number,
  toIndex: number,
): Readonly<{
  levelset: C2mLevelsetJsonV1;
  selectedLevelIndex: number;
}> {
  if (levelset.levels.length <= 1) {
    return {
      levelset,
      selectedLevelIndex: 0,
    };
  }

  const sourceIndex = clampIndex(fromIndex, levelset.levels.length);
  const targetIndex = clampIndex(toIndex, levelset.levels.length);
  if (sourceIndex === targetIndex) {
    return {
      levelset,
      selectedLevelIndex: sourceIndex,
    };
  }

  const nextLevels = [...levelset.levels];
  const [moved] = nextLevels.splice(sourceIndex, 1);
  if (!moved) {
    return {
      levelset,
      selectedLevelIndex: sourceIndex,
    };
  }
  nextLevels.splice(targetIndex, 0, moved);

  return {
    levelset: resequenceGeneratedLevelEntries({
      ...levelset,
      levels: nextLevels,
    }),
    selectedLevelIndex: targetIndex,
  };
}
