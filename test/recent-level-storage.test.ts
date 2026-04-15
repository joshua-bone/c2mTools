import { describe, expect, it } from "vitest";

import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import {
  createPersistedRecentLevelEntry,
  decodePersistedRecentLevelEntry,
  findMatchingRecentLevelId,
  parsePersistedRecentLevels,
  removeRecentLevelEntry,
  serializePersistedRecentLevels,
  upsertRecentLevelEntry,
} from "../web/src/recentLevelStorage.js";

describe("recent level storage", () => {
  it("round-trips a persisted recent level entry", () => {
    const doc = {
      ...createEmptyC2mDoc(),
      title: "Round Trip",
    };
    const encoded = serializePersistedRecentLevels([
      createPersistedRecentLevelEntry({
        id: "recent-1",
        doc,
        fileName: "round-trip.c2m",
        thumbnailDataUrl: "data:image/png;base64,AAAA",
        updatedAt: 1_776_254_400_000,
      }),
    ]);

    const [entry] = parsePersistedRecentLevels(encoded);
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected persisted recent level entry");
    expect(entry).toEqual(
      expect.objectContaining({
        id: "recent-1",
        fileName: "round-trip.c2m",
        title: "Round Trip",
        updatedAt: 1_776_254_400_000,
        width: 32,
        height: 32,
        thumbnailDataUrl: "data:image/png;base64,AAAA",
      }),
    );

    expect(decodePersistedRecentLevelEntry(entry)).toEqual(
      expect.objectContaining({
        fileName: "round-trip.c2m",
        warnings: [],
        doc: expect.objectContaining({
          schema: "c2mTools.c2m.json.v1",
          title: "Round Trip",
          map: doc.map,
        }),
      }),
    );
  });

  it("upserts by id and keeps the latest entry first", () => {
    const doc = createEmptyC2mDoc();
    const older = createPersistedRecentLevelEntry({
      id: "recent-1",
      doc: {
        ...doc,
        title: "Older",
      },
      fileName: "older.c2m",
      updatedAt: 10,
    });
    const newer = createPersistedRecentLevelEntry({
      id: "recent-2",
      doc: {
        ...doc,
        title: "Newer",
      },
      fileName: "newer.c2m",
      updatedAt: 20,
    });
    const updatedOlder = createPersistedRecentLevelEntry({
      id: "recent-1",
      doc: {
        ...doc,
        title: "Updated Older",
      },
      fileName: "older.c2m",
      updatedAt: 30,
    });

    expect(upsertRecentLevelEntry([older, newer], updatedOlder).map((entry) => entry.id)).toEqual([
      "recent-1",
      "recent-2",
    ]);
  });

  it("removes entries by id", () => {
    const doc = createEmptyC2mDoc();
    const entries = [
      createPersistedRecentLevelEntry({ id: "recent-1", doc, fileName: "one.c2m", updatedAt: 1 }),
      createPersistedRecentLevelEntry({ id: "recent-2", doc, fileName: "two.c2m", updatedAt: 2 }),
    ];

    expect(removeRecentLevelEntry(entries, "recent-1").map((entry) => entry.id)).toEqual([
      "recent-2",
    ]);
  });

  it("matches the current session document to an existing recent entry", () => {
    const doc = {
      ...createEmptyC2mDoc(),
      title: "Same Level",
    };
    const entry = createPersistedRecentLevelEntry({
      id: "recent-1",
      doc,
      fileName: "same.c2m",
    });

    expect(findMatchingRecentLevelId([entry], doc, "same.c2m")).toBe("recent-1");
    expect(findMatchingRecentLevelId([entry], doc, "different.c2m")).toBeNull();
  });

  it("drops invalid persisted entries", () => {
    expect(
      parsePersistedRecentLevels(
        JSON.stringify({
          schema: "c2mTools.web.recentLevels.v1",
          entries: [
            {
              id: "recent-1",
              fileName: "valid.c2m",
              title: "Valid",
              updatedAt: 1,
              width: 32,
              height: 32,
              thumbnailDataUrl: null,
              encodedC2mBase64: "AQID",
            },
            {
              id: "",
              fileName: "invalid.c2m",
              title: "Invalid",
              updatedAt: 2,
              width: 32,
              height: 32,
              thumbnailDataUrl: null,
              encodedC2mBase64: "AQID",
            },
          ],
        }),
      ).map((entry) => entry.id),
    ).toEqual(["recent-1"]);
  });
});
