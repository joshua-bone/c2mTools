import { describe, expect, it } from "vitest";

import {
  createLevelsetEntry,
  createSingleLevelset,
  replaceLevelsetEntryDoc,
} from "../src/c2g/c2gLevelsetJsonV1.js";
import { createMinimalC2gText, parseC2gText } from "../src/c2g/c2gText.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import {
  addLevelAfterSelection,
  deleteLevelAtIndex,
  duplicateLevelAtIndex,
  moveLevelToIndex,
  resequenceGeneratedLevelEntries,
} from "../web/src/levelsetEditing.js";

describe("levelset editing", () => {
  it("adds a generated level after the current selection", () => {
    const levelset = createSingleLevelset(
      {
        ...createEmptyC2mDoc(),
        title: "Start",
      },
      {
        fileName: "001_start.c2m",
        source: "existing",
      },
    );

    const next = addLevelAfterSelection(levelset, 0);

    expect(next.selectedLevelIndex).toBe(1);
    expect(next.levelset.levels.map((level) => level.doc.title)).toEqual(["Start", "Level 2"]);
    expect(next.levelset.levels[1]?.relativePath).toBe("2_level_2.c2m");
    expect(next.levelset.levels[1]?.source).toBe("generated");
  });

  it("duplicates a level into a generated entry and renumbers generated prefixes", () => {
    const base = {
      schema: "c2mTools.c2g.levelset.json.v1",
      setName: "Dupes",
      c2gFileName: "set.c2g",
      levels: [
        createLevelsetEntry(
          { ...createEmptyC2mDoc(), title: "Alpha" },
          {
            relativePath: "001_alpha.c2m",
            source: "existing",
          },
        ),
        createLevelsetEntry(
          { ...createEmptyC2mDoc(), title: "Gamma" },
          {
            relativePath: "002_gamma.c2m",
            source: "generated",
          },
        ),
      ],
      c2g: parseC2gText(createMinimalC2gText("Dupes", ["001_alpha.c2m", "002_gamma.c2m"])),
    } as const;

    const next = duplicateLevelAtIndex(base, 0);

    expect(next.selectedLevelIndex).toBe(1);
    expect(next.levelset.levels.map((level) => level.doc.title)).toEqual([
      "Alpha",
      "Alpha",
      "Gamma",
    ]);
    expect(next.levelset.levels.map((level) => level.relativePath)).toEqual([
      "001_alpha.c2m",
      "2_alpha.c2m",
      "3_gamma.c2m",
    ]);
  });

  it("deletes a level and keeps selection on the nearest surviving level", () => {
    const base = createSingleLevelset(
      {
        ...createEmptyC2mDoc(),
        title: "First",
      },
      {
        fileName: "001_first.c2m",
        source: "existing",
      },
    );
    const withSecond = addLevelAfterSelection(base, 0).levelset;
    const withThird = addLevelAfterSelection(withSecond, 1).levelset;

    const next = deleteLevelAtIndex(withThird, 1);

    expect(next.selectedLevelIndex).toBe(1);
    expect(next.levelset.levels.map((level) => level.doc.title)).toEqual(["First", "Level 3"]);
    expect(next.levelset.levels.map((level) => level.relativePath)).toEqual([
      "001_first.c2m",
      "2_level_3.c2m",
    ]);
  });

  it("moves levels and renumbers generated paths to match the new order", () => {
    const base = {
      schema: "c2mTools.c2g.levelset.json.v1",
      setName: "Move",
      c2gFileName: "set.c2g",
      levels: [
        createLevelsetEntry(
          { ...createEmptyC2mDoc(), title: "Alpha" },
          {
            relativePath: "001_alpha.c2m",
            source: "generated",
          },
        ),
        createLevelsetEntry(
          { ...createEmptyC2mDoc(), title: "Beta" },
          {
            relativePath: "002_beta.c2m",
            source: "generated",
          },
        ),
        createLevelsetEntry(
          { ...createEmptyC2mDoc(), title: "Gamma" },
          {
            relativePath: "003_gamma.c2m",
            source: "generated",
          },
        ),
      ],
      c2g: parseC2gText(
        createMinimalC2gText("Move", ["001_alpha.c2m", "002_beta.c2m", "003_gamma.c2m"]),
      ),
    } as const;

    const next = moveLevelToIndex(base, 2, 0);

    expect(next.selectedLevelIndex).toBe(0);
    expect(next.levelset.levels.map((level) => level.doc.title)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
    expect(next.levelset.levels.map((level) => level.relativePath)).toEqual([
      "1_gamma.c2m",
      "2_alpha.c2m",
      "3_beta.c2m",
    ]);
  });

  it("re-sequences generated filenames after a generated title change", () => {
    const levelset = createSingleLevelset(
      {
        ...createEmptyC2mDoc(),
        title: "Level 1",
      },
      {
        fileName: "001_level_1.c2m",
        source: "generated",
      },
    );

    const renamed = replaceLevelsetEntryDoc(levelset, 0, {
      ...levelset.levels[0]!.doc,
      title: "Boss Zone",
    });

    expect(resequenceGeneratedLevelEntries(renamed).levels[0]?.relativePath).toBe(
      "1_boss_zone.c2m",
    );
  });
});
