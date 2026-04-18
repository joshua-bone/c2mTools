import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { C2M_LEVELSET_JSON_V1_SCHEMA, createLevelsetEntry } from "../src/c2g/c2gLevelsetJsonV1.js";
import { createMinimalC2gText, parseC2gText } from "../src/c2g/c2gText.js";
import { decodeC2mToJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { buildSavedLevelsetArchive } from "../web/src/saveLevelset.js";

const textDecoder = new TextDecoder();

describe("save levelset", () => {
  it("writes a zipped set with preserved c2g text and level order", () => {
    const alpha = {
      ...createEmptyC2mDoc(),
      title: "Alpha",
    };
    const beta = {
      ...createEmptyC2mDoc(),
      title: "Beta",
    };
    const levelset = {
      schema: C2M_LEVELSET_JSON_V1_SCHEMA,
      setName: "Episode Pack",
      c2gFileName: "episode.c2g",
      levels: [
        createLevelsetEntry(beta, { relativePath: "levels/002_beta.c2m", source: "existing" }),
        createLevelsetEntry(alpha, { relativePath: "levels/001_alpha.c2m", source: "existing" }),
      ],
      c2g: parseC2gText(
        [
          'game "Old Name"',
          "script",
          '"intro text"',
          'music "theme.ogg" map "levels/002_beta.c2m"',
          'map "levels/001_alpha.c2m"',
          "",
        ].join("\n"),
      ),
    } as const;

    const archive = buildSavedLevelsetArchive(levelset);
    const unzipped = unzipSync(archive.bytes);

    expect(archive.fileName).toBe("episode_pack.zip");
    expect(Object.keys(unzipped).sort()).toEqual([
      "episode.c2g",
      "levels/001_alpha.c2m",
      "levels/002_beta.c2m",
    ]);
    expect(archive.c2gText).toBe(
      [
        'game "Episode Pack"',
        "script",
        '"intro text"',
        'music "theme.ogg" map "levels/002_beta.c2m"',
        'map "levels/001_alpha.c2m"',
        "",
      ].join("\n"),
    );
    expect(textDecoder.decode(unzipped["episode.c2g"]!)).toBe(archive.c2gText);
    expect(decodeC2mToJsonV1(unzipped["levels/001_alpha.c2m"]!).title).toBe("Alpha");
    expect(decodeC2mToJsonV1(unzipped["levels/002_beta.c2m"]!).title).toBe("Beta");
  });

  it("adds minimal map entries for levels that were not in the original c2g", () => {
    const alpha = {
      ...createEmptyC2mDoc(),
      title: "Alpha",
    };
    const gamma = {
      ...createEmptyC2mDoc(),
      title: "Gamma",
    };
    const levelset = {
      schema: C2M_LEVELSET_JSON_V1_SCHEMA,
      setName: "New Entries",
      c2gFileName: "set.c2g",
      levels: [
        createLevelsetEntry(alpha, { relativePath: "001_alpha.c2m", source: "existing" }),
        createLevelsetEntry(gamma, { relativePath: "003_gamma.c2m", source: "generated" }),
      ],
      c2g: parseC2gText(createMinimalC2gText("New Entries", ["001_alpha.c2m"])),
    } as const;

    const archive = buildSavedLevelsetArchive(levelset);

    expect(archive.c2gText).toBe(
      ['game "New Entries"', 'map "001_alpha.c2m"', 'map "003_gamma.c2m"', ""].join("\n"),
    );
  });
});
