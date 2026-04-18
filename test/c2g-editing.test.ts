import { describe, expect, it } from "vitest";

import { createLevelsetEntry } from "../src/c2g/c2gLevelsetJsonV1.js";
import { createMinimalC2gText, parseC2gText, serializeC2gText } from "../src/c2g/c2gText.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { applyRawC2gTextToLevelset } from "../web/src/c2gEditing.js";

function createLevelsetFixture() {
  const alpha = createLevelsetEntry(
    { ...createEmptyC2mDoc(), title: "Alpha" },
    {
      id: "alpha",
      relativePath: "001_alpha.c2m",
      source: "existing",
    },
  );
  const beta = createLevelsetEntry(
    { ...createEmptyC2mDoc(), title: "Beta" },
    {
      id: "beta",
      relativePath: "002_beta.c2m",
      source: "existing",
    },
  );
  const gamma = createLevelsetEntry(
    { ...createEmptyC2mDoc(), title: "Gamma" },
    {
      id: "gamma",
      relativePath: "003_gamma.c2m",
      source: "existing",
    },
  );

  return {
    schema: "c2mTools.c2g.levelset.json.v1",
    setName: "Original Set",
    c2gFileName: "set.c2g",
    levels: [alpha, beta, gamma],
    c2g: parseC2gText(
      createMinimalC2gText("Original Set", ["001_alpha.c2m", "002_beta.c2m", "003_gamma.c2m"]),
    ),
  } as const;
}

describe("applyRawC2gTextToLevelset", () => {
  it("updates the set name from the raw game command", () => {
    const levelset = createLevelsetFixture();

    const next = applyRawC2gTextToLevelset(
      levelset,
      'game "Renamed Set"\nmap "001_alpha.c2m"\nmap "002_beta.c2m"\nmap "003_gamma.c2m"\n',
      1,
    );

    expect(next.levelset.setName).toBe("Renamed Set");
    expect(next.levelset.levels.map((entry) => entry.id)).toEqual(["alpha", "beta", "gamma"]);
    expect(next.selectedLevelIndex).toBe(1);
  });

  it("reorders levels from the raw map order while preserving the selected level", () => {
    const levelset = createLevelsetFixture();

    const next = applyRawC2gTextToLevelset(
      levelset,
      'game "Original Set"\nmap "003_gamma.c2m"\nmap "001_alpha.c2m"\nmap "002_beta.c2m"\n',
      0,
    );

    expect(next.levelset.levels.map((entry) => entry.id)).toEqual(["gamma", "alpha", "beta"]);
    expect(next.selectedLevelIndex).toBe(1);
  });

  it("preserves unsupported directives byte-for-byte", () => {
    const levelset = createLevelsetFixture();
    const rawText = [
      "; keep this comment",
      'game "Fancy Set"',
      "",
      'script "noop.lua"',
      '"preamble"',
      'music "track1" map "002_beta.c2m"',
      "do something strange",
      'map "001_alpha.c2m"',
      'map "003_gamma.c2m"',
      "",
    ].join("\n");

    const next = applyRawC2gTextToLevelset(levelset, rawText, 2);

    expect(next.levelset.setName).toBe("Fancy Set");
    expect(next.levelset.levels.map((entry) => entry.id)).toEqual(["beta", "alpha", "gamma"]);
    expect(serializeC2gText(next.levelset.c2g)).toBe(rawText);
  });

  it("rejects raw edits that do not reference the current levels exactly once", () => {
    const levelset = createLevelsetFixture();

    expect(() =>
      applyRawC2gTextToLevelset(
        levelset,
        'game "Broken"\nmap "001_alpha.c2m"\nmap "001_alpha.c2m"\nmap "003_gamma.c2m"\n',
        0,
      ),
    ).toThrow(/exactly once|duplicate/i);
  });
});
