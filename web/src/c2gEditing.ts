import type { C2mLevelsetJsonV1 } from "../../src/c2g/c2gLevelsetJsonV1.js";
import { clampSelectedLevelIndex } from "../../src/c2g/c2gLevelsetJsonV1.js";
import { normalizeC2gRelativePath, parseC2gText } from "../../src/c2g/c2gText.js";

type AppliedRawC2gResult = Readonly<{
  levelset: C2mLevelsetJsonV1;
  selectedLevelIndex: number;
}>;

function formatPathList(paths: ReadonlyArray<string>): string {
  return paths.join(", ");
}

export function applyRawC2gTextToLevelset(
  levelset: C2mLevelsetJsonV1,
  rawText: string,
  selectedLevelIndex: number,
): AppliedRawC2gResult {
  const parsed = parseC2gText(rawText);
  const currentLevels = levelset.levels;

  if (currentLevels.length <= 0) {
    return {
      levelset: {
        ...levelset,
        setName:
          parsed.gameName === null ? levelset.setName : parsed.gameName.trim() || "Untitled Set",
        c2g: parsed,
      },
      selectedLevelIndex: 0,
    };
  }

  const currentByPath = new Map<string, (typeof currentLevels)[number]>();
  const currentPaths = currentLevels.map((level) => {
    const normalizedPath = normalizeC2gRelativePath(level.relativePath);
    currentByPath.set(normalizedPath, level);
    return normalizedPath;
  });

  const nextPaths = parsed.entries.map((entry) => normalizeC2gRelativePath(entry.relativePath));
  if (nextPaths.length !== currentLevels.length) {
    throw new Error(
      `C2G map list must reference all ${currentLevels.length} current levels exactly once.`,
    );
  }

  const seenPaths = new Set<string>();
  const duplicatePaths: string[] = [];
  for (const path of nextPaths) {
    if (seenPaths.has(path)) {
      if (!duplicatePaths.includes(path)) duplicatePaths.push(path);
      continue;
    }
    seenPaths.add(path);
  }
  if (duplicatePaths.length > 0) {
    throw new Error(`C2G map list contains duplicate levels: ${formatPathList(duplicatePaths)}`);
  }

  const unknownPaths = nextPaths.filter((path) => !currentByPath.has(path));
  if (unknownPaths.length > 0) {
    throw new Error(
      `C2G map list references unknown levels: ${formatPathList(unknownPaths)}. Rename levels with the level manager instead.`,
    );
  }

  const missingPaths = currentPaths.filter((path) => !nextPaths.includes(path));
  if (missingPaths.length > 0) {
    throw new Error(
      `C2G map list is missing current levels: ${formatPathList(missingPaths)}. Reordering must keep every level exactly once.`,
    );
  }

  const nextLevels = nextPaths.map((path) => currentByPath.get(path)!);
  const selectedEntry =
    currentLevels[clampSelectedLevelIndex(levelset, selectedLevelIndex)] ?? null;
  const nextSelectedLevelIndex = Math.max(
    0,
    selectedEntry ? nextLevels.findIndex((level) => level.id === selectedEntry.id) : 0,
  );

  return {
    levelset: {
      ...levelset,
      setName:
        parsed.gameName === null ? levelset.setName : parsed.gameName.trim() || "Untitled Set",
      levels: nextLevels,
      c2g: parsed,
    },
    selectedLevelIndex: nextSelectedLevelIndex,
  };
}
