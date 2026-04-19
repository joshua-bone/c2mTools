import { describe, expect, it } from "vitest";

import { createSingleLevelset, stringifyC2mLevelsetJsonV1 } from "../src/c2g/c2gLevelsetJsonV1.js";
import { encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { compressStoredJson } from "../web/src/storageCompression.js";
import {
  createPersistedRecentSetEntry,
  decodePersistedRecentSetEntry,
  findMatchingRecentSetId,
  parsePersistedRecentSets,
  removeRecentSetEntry,
  serializePersistedRecentSets,
  upsertRecentSetEntry,
} from "../web/src/recentSetStorage.js";

function createLevelset(title: string, fileName = "round-trip.c2m") {
  return createSingleLevelset(
    {
      ...createEmptyC2mDoc(),
      title,
    },
    {
      fileName,
      source: "existing",
    },
  );
}

describe("recent set storage", () => {
  it("round-trips a persisted recent set entry", () => {
    const levelset = createLevelset("Round Trip");
    const encoded = serializePersistedRecentSets([
      createPersistedRecentSetEntry({
        id: "recent-1",
        levelset,
        fileName: "episode-pack",
        selectedLevelIndex: 0,
        thumbnailDataUrl: "data:image/png;base64,AAAA",
        updatedAt: 1_776_254_400_000,
      }),
    ]);

    const [entry] = parsePersistedRecentSets(encoded);
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected persisted recent set entry");
    expect(entry).toEqual(
      expect.objectContaining({
        id: "recent-1",
        fileName: "episode-pack",
        title: "Round Trip",
        updatedAt: 1_776_254_400_000,
        levelCount: 1,
        selectedLevelIndex: 0,
        selectedLevelTitle: "Round Trip",
        width: 32,
        height: 32,
        thumbnailDataUrl: "data:image/png;base64,AAAA",
      }),
    );

    expect(decodePersistedRecentSetEntry(entry)).toEqual({
      levelset,
      fileName: "episode-pack",
      selectedLevelIndex: 0,
    });
  });

  it("upserts by id and keeps the latest entry first", () => {
    const older = createPersistedRecentSetEntry({
      id: "recent-1",
      levelset: createLevelset("Older"),
      fileName: "older",
      selectedLevelIndex: 0,
      updatedAt: 10,
    });
    const newer = createPersistedRecentSetEntry({
      id: "recent-2",
      levelset: createLevelset("Newer"),
      fileName: "newer",
      selectedLevelIndex: 0,
      updatedAt: 20,
    });
    const updatedOlder = createPersistedRecentSetEntry({
      id: "recent-1",
      levelset: createLevelset("Updated Older"),
      fileName: "older",
      selectedLevelIndex: 0,
      updatedAt: 30,
    });

    expect(upsertRecentSetEntry([older, newer], updatedOlder).map((entry) => entry.id)).toEqual([
      "recent-1",
      "recent-2",
    ]);
  });

  it("removes entries by id", () => {
    const entries = [
      createPersistedRecentSetEntry({
        id: "recent-1",
        levelset: createLevelset("One"),
        fileName: "one",
        selectedLevelIndex: 0,
        updatedAt: 1,
      }),
      createPersistedRecentSetEntry({
        id: "recent-2",
        levelset: createLevelset("Two"),
        fileName: "two",
        selectedLevelIndex: 0,
        updatedAt: 2,
      }),
    ];

    expect(removeRecentSetEntry(entries, "recent-1").map((entry) => entry.id)).toEqual([
      "recent-2",
    ]);
  });

  it("matches the current session levelset to an existing recent set", () => {
    const levelset = createLevelset("Same Set");
    const entry = createPersistedRecentSetEntry({
      id: "recent-1",
      levelset,
      fileName: "same-set",
      selectedLevelIndex: 0,
    });

    expect(findMatchingRecentSetId([entry], levelset, "same-set")).toBe("recent-1");
    expect(findMatchingRecentSetId([entry], levelset, "different-set")).toBeNull();
  });

  it("stores levelsets in compressed form", () => {
    const levels = Array.from({ length: 18 }, (_, index) => ({
      ...createLevelset(`Level ${index + 1}`, `${String(index + 1).padStart(3, "0")}.c2m`)
        .levels[0]!,
    }));
    const levelset = {
      ...createLevelset("Big Set"),
      levels,
    };
    const rawJson = stringifyC2mLevelsetJsonV1(levelset);
    const entry = createPersistedRecentSetEntry({
      id: "recent-big",
      levelset,
      fileName: "big-set",
      selectedLevelIndex: 0,
    });

    expect(entry.levelsetJsonGzipBase64.length).toBeLessThan(rawJson.length);
    expect(decodePersistedRecentSetEntry(entry)).toEqual({
      levelset,
      fileName: "big-set",
      selectedLevelIndex: 0,
    });
  });

  it("migrates legacy recent level entries into one-level recent sets", () => {
    const doc = {
      ...createEmptyC2mDoc(),
      title: "Legacy Level",
    };
    const legacy = parsePersistedRecentSets(
      JSON.stringify({
        schema: "c2mTools.web.recentLevels.v1",
        entries: [
          {
            id: "recent-1",
            fileName: "legacy.c2m",
            title: "Legacy Level",
            updatedAt: 1,
            width: 32,
            height: 32,
            thumbnailDataUrl: null,
            encodedC2mBase64: Buffer.from(encodeC2mFromJsonV1(doc)).toString("base64"),
          },
        ],
      }),
    );

    expect(legacy).toHaveLength(1);
    const decoded = decodePersistedRecentSetEntry(legacy[0]!);
    expect(decoded.fileName).toBe("legacy.c2m");
    expect(decoded.selectedLevelIndex).toBe(0);
    expect(decoded.levelset.setName).toBe("Legacy Level");
    expect(decoded.levelset.levels).toHaveLength(1);
    expect(decoded.levelset.levels[0]).toEqual(
      expect.objectContaining({
        relativePath: "legacy.c2m",
        fileName: "legacy.c2m",
        source: "existing",
        doc: expect.objectContaining({
          title: "Legacy Level",
          map: doc.map,
        }),
      }),
    );
  });

  it("drops invalid persisted entries", () => {
    expect(
      parsePersistedRecentSets(
        JSON.stringify({
          schema: "c2mTools.web.recentSets.v1",
          entries: [
            {
              id: "recent-1",
              fileName: "valid",
              title: "Valid",
              updatedAt: 1,
              levelCount: 1,
              selectedLevelIndex: 0,
              selectedLevelTitle: "One",
              width: 32,
              height: 32,
              thumbnailDataUrl: null,
              levelsetJsonGzipBase64: compressStoredJson(
                stringifyC2mLevelsetJsonV1(createLevelset("Valid")),
              ),
            },
            {
              id: "",
              fileName: "invalid",
              title: "Invalid",
              updatedAt: 2,
              levelCount: 1,
              selectedLevelIndex: 0,
              selectedLevelTitle: "Two",
              width: 32,
              height: 32,
              thumbnailDataUrl: null,
              levelsetJsonGzipBase64: compressStoredJson(
                stringifyC2mLevelsetJsonV1(createLevelset("Invalid")),
              ),
            },
          ],
        }),
      ).map((entry) => entry.id),
    ).toEqual(["recent-1"]);
  });

  it("migrates persisted recent sets that still use raw levelsetJson", () => {
    const levelset = createLevelset("Legacy Raw");

    const [entry] = parsePersistedRecentSets(
      JSON.stringify({
        schema: "c2mTools.web.recentSets.v1",
        entries: [
          {
            id: "recent-legacy",
            fileName: "legacy-raw",
            title: "Legacy Raw",
            updatedAt: 1,
            levelCount: 1,
            selectedLevelIndex: 0,
            selectedLevelTitle: "Legacy Raw",
            width: 32,
            height: 32,
            thumbnailDataUrl: null,
            levelsetJson: stringifyC2mLevelsetJsonV1(levelset),
          },
        ],
      }),
    );

    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected migrated recent set entry");
    expect(decodePersistedRecentSetEntry(entry)).toEqual({
      levelset,
      fileName: "legacy-raw",
      selectedLevelIndex: 0,
    });
    expect(entry.levelsetJsonGzipBase64.length).toBeGreaterThan(0);
  });
});
