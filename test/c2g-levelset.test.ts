import { describe, expect, it } from "vitest";

import {
  createLevelsetEntry,
  createSingleLevelset,
  getSelectedLevelEntry,
  parseC2mLevelsetJsonV1,
  replaceLevelsetEntryDoc,
  stringifyC2mLevelsetJsonV1,
} from "../src/c2g/c2gLevelsetJsonV1.js";
import { createMinimalC2gText, parseC2gText } from "../src/c2g/c2gText.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";

describe("c2g levelset json", () => {
  it("creates a single-level adapter with matching c2g entry", () => {
    const doc = {
      ...createEmptyC2mDoc(),
      title: "Level 1",
    };

    const levelset = createSingleLevelset(doc, {
      fileName: "001_level_1.c2m",
      source: "existing",
    });

    expect(levelset.setName).toBe("Level 1");
    expect(levelset.levels).toHaveLength(1);
    expect(levelset.levels[0]?.relativePath).toBe("001_level_1.c2m");
    expect(levelset.c2g.entries.map((entry) => entry.relativePath)).toEqual(["001_level_1.c2m"]);
  });

  it("round-trips through stringify and parse", () => {
    const doc = {
      ...createEmptyC2mDoc(),
      title: "Round Trip",
    };
    const levelset = createSingleLevelset(doc, {
      fileName: "001_round_trip.c2m",
      source: "existing",
    });

    expect(parseC2mLevelsetJsonV1(JSON.parse(stringifyC2mLevelsetJsonV1(levelset)))).toEqual(
      levelset,
    );
  });

  it("replaces only the selected level document", () => {
    const baseDoc = createEmptyC2mDoc();
    const levelset = createSingleLevelset(baseDoc, {
      fileName: "001_base.c2m",
      source: "existing",
    });
    const nextDoc = {
      ...baseDoc,
      title: "Changed",
    };

    const updated = replaceLevelsetEntryDoc(levelset, 0, nextDoc);

    expect(getSelectedLevelEntry(updated, 0)?.doc).toEqual(nextDoc);
    expect(updated.c2g).toEqual(levelset.c2g);
    expect(updated.levels[0]?.relativePath).toBe("001_base.c2m");
  });

  it("updates only the targeted level in a multi-level set", () => {
    const alpha = {
      ...createEmptyC2mDoc(),
      title: "Alpha",
      author: "One",
    };
    const beta = {
      ...createEmptyC2mDoc(),
      title: "Beta",
      author: "Two",
    };
    const levelset = {
      schema: "c2mTools.c2g.levelset.json.v1",
      setName: "Set",
      c2gFileName: "set.c2g",
      levels: [
        createLevelsetEntry(alpha, {
          relativePath: "001_alpha.c2m",
          source: "existing",
        }),
        createLevelsetEntry(beta, {
          relativePath: "002_beta.c2m",
          source: "existing",
        }),
      ],
      c2g: parseC2gText(createMinimalC2gText("Set", ["001_alpha.c2m", "002_beta.c2m"])),
    } as const;

    const updated = replaceLevelsetEntryDoc(levelset, 1, {
      ...beta,
      title: "Gamma",
      author: "Three",
    });

    expect(updated.levels[0]?.doc.title).toBe("Alpha");
    expect(updated.levels[0]?.doc.author).toBe("One");
    expect(updated.levels[1]?.doc.title).toBe("Gamma");
    expect(updated.levels[1]?.doc.author).toBe("Three");
    expect(updated.levels.map((entry) => entry.relativePath)).toEqual([
      "001_alpha.c2m",
      "002_beta.c2m",
    ]);
  });
});
