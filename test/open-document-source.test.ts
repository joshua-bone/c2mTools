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

    expect(loaded.fileName).toBe("Episode Pack");
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

    expect(loaded.fileName).toBe("No Order Yet");
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

    expect(loaded.fileName).toBe("pack");
    expect(loaded.levelset.setName).toBe("Packed Set");
    expect(loaded.levelset.levels.map((level) => level.relativePath)).toEqual([
      "episodes/002_beta.c2m",
      "episodes/001_alpha.c2m",
    ]);
  });

  it("uses the only .c2g in an archive even when it is not at the root", () => {
    const zipBytes = zipSync({
      "jbonemisfits/jbone_misfits.c2g": textEncoder.encode(
        'game "Jbone Misfits"\nmap "levels/misfit.c2m"\n',
      ),
      "jbonemisfits/levels/misfit.c2m": encodeLevel("Misfit"),
    });

    const loaded = loadLevelsetFromOpenedDocumentSource({
      kind: "file",
      name: "jbonemisfits.zip",
      bytes: zipBytes,
    });

    expect(loaded.fileName).toBe("jbonemisfits");
    expect(loaded.levelset.setName).toBe("Jbone Misfits");
    expect(loaded.levelset.c2gFileName).toBe("jbone_misfits.c2g");
    expect(loaded.levelset.levels.map((level) => level.relativePath)).toEqual([
      "levels/misfit.c2m",
    ]);
    expect(loaded.warnings).toEqual([]);
  });

  it("uses the first .c2g when multiple are present", () => {
    const zipBytes = zipSync({
      "pack/a.c2g": textEncoder.encode('game "Alpha"\nmap "levels/one.c2m"\n'),
      "pack/b.c2g": textEncoder.encode('game "Beta"\nmap "levels/two.c2m"\n'),
      "pack/levels/one.c2m": encodeLevel("One"),
      "pack/levels/two.c2m": encodeLevel("Two"),
    });

    const loaded = loadLevelsetFromOpenedDocumentSource({
      kind: "file",
      name: "pack.zip",
      bytes: zipBytes,
    });

    expect(loaded.levelset.setName).toBe("Alpha");
    expect(loaded.levelset.c2gFileName).toBe("a.c2g");
    expect(loaded.levelset.levels.map((level) => level.doc.title)).toEqual(["One", "Two"]);
    expect(loaded.warnings).toContain("Multiple .c2g files found; using a.c2g.");
  });
});
