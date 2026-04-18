import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { createMinimalC2gText } from "../src/c2g/c2gText.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { loadLevelsetFromOpenedDocumentSource } from "../web/src/openDocumentSource.js";

const textEncoder = new TextEncoder();

function encodeLevel(title: string): Uint8Array {
  return encodeC2mFromJsonV1({
    ...createEmptyC2mDoc(),
    title,
  });
}

describe("open document source", () => {
  it("opens a single .c2m as a one-level set", () => {
    const loaded = loadLevelsetFromOpenedDocumentSource({
      kind: "file",
      name: "alpha.c2m",
      bytes: encodeLevel("Alpha"),
    });

    expect(loaded.fileName).toBe("alpha.c2m");
    expect(loaded.levelset.setName).toBe("Alpha");
    expect(loaded.levelset.levels).toHaveLength(1);
    expect(loaded.levelset.levels[0]?.relativePath).toBe("alpha.c2m");
    expect(loaded.levelset.levels[0]?.doc.title).toBe("Alpha");
  });

  it("opens a folder with a root c2g and preserves c2g order", () => {
    const loaded = loadLevelsetFromOpenedDocumentSource({
      kind: "collection",
      name: "Episode Pack",
      entries: [
        {
          relativePath: "set.c2g",
          bytes: textEncoder.encode(
            createMinimalC2gText("Episode Pack", ["levels/002_beta.c2m", "levels/001_alpha.c2m"]),
          ),
        },
        {
          relativePath: "levels/001_alpha.c2m",
          bytes: encodeLevel("Alpha"),
        },
        {
          relativePath: "levels/002_beta.c2m",
          bytes: encodeLevel("Beta"),
        },
      ],
    });

    expect(loaded.levelset.c2gFileName).toBe("set.c2g");
    expect(loaded.levelset.levels.map((level) => level.relativePath)).toEqual([
      "levels/002_beta.c2m",
      "levels/001_alpha.c2m",
    ]);
    expect(loaded.levelset.levels.map((level) => level.doc.title)).toEqual(["Beta", "Alpha"]);
  });

  it("opens a folder without a c2g using lexicographic order", () => {
    const loaded = loadLevelsetFromOpenedDocumentSource({
      kind: "collection",
      name: "No Order Yet",
      entries: [
        {
          relativePath: "b/020_beta.c2m",
          bytes: encodeLevel("Beta"),
        },
        {
          relativePath: "a/010_alpha.c2m",
          bytes: encodeLevel("Alpha"),
        },
      ],
    });

    expect(loaded.levelset.c2gFileName).toBe("set.c2g");
    expect(loaded.levelset.levels.map((level) => level.relativePath)).toEqual([
      "a/010_alpha.c2m",
      "b/020_beta.c2m",
    ]);
    expect(loaded.warnings).toContain("No root .c2g found; synthesized set.c2g.");
  });

  it("opens a zip with nested levels beneath a shared root folder", () => {
    const zipBytes = zipSync({
      "pack/set.c2g": textEncoder.encode(
        createMinimalC2gText("Packed Set", ["episodes/002_beta.c2m", "episodes/001_alpha.c2m"]),
      ),
      "pack/episodes/001_alpha.c2m": encodeLevel("Alpha"),
      "pack/episodes/002_beta.c2m": encodeLevel("Beta"),
    });

    const loaded = loadLevelsetFromOpenedDocumentSource({
      kind: "file",
      name: "pack.zip",
      bytes: zipBytes,
    });

    expect(loaded.levelset.setName).toBe("Packed Set");
    expect(loaded.levelset.levels.map((level) => level.relativePath)).toEqual([
      "episodes/002_beta.c2m",
      "episodes/001_alpha.c2m",
    ]);
  });
});
