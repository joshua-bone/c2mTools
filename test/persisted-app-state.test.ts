import { describe, expect, it } from "vitest";

import { createSingleLevelset } from "../src/c2g/c2gLevelsetJsonV1.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import {
  DEFAULT_PERSISTED_APP_PREFERENCES,
  parsePersistedAppPreferences,
  parsePersistedEditorSession,
  serializePersistedAppPreferences,
  serializePersistedEditorSession,
} from "../web/src/persistedAppState.js";

describe("persisted app preferences", () => {
  it("round-trips the stored view mode", () => {
    const encoded = serializePersistedAppPreferences({
      viewMode: "board",
      leftPanelWidth: 260,
      rightPanelWidth: 340,
    });

    expect(parsePersistedAppPreferences(encoded)).toEqual({
      viewMode: "board",
      leftPanelWidth: 260,
      rightPanelWidth: 340,
    });
  });

  it("migrates the legacy image view mode to the board view", () => {
    expect(
      parsePersistedAppPreferences(
        JSON.stringify({
          schema: "c2mTools.web.appPreferences.v1",
          viewMode: "image",
        }),
      ),
    ).toEqual({
      viewMode: "board",
      leftPanelWidth: 236,
      rightPanelWidth: 320,
    });
  });

  it("falls back to defaults for invalid stored values", () => {
    expect(parsePersistedAppPreferences("not json")).toEqual(DEFAULT_PERSISTED_APP_PREFERENCES);
    expect(
      parsePersistedAppPreferences(
        JSON.stringify({
          schema: "c2mTools.web.appPreferences.v1",
          viewMode: "unknown",
        }),
      ),
    ).toEqual(DEFAULT_PERSISTED_APP_PREFERENCES);
  });
});

describe("persisted editor session", () => {
  it("round-trips the current levelset snapshot", () => {
    const doc = {
      ...createEmptyC2mDoc(),
      title: "Session Title",
    };
    const levelset = createSingleLevelset(doc, {
      fileName: "session.c2m",
      source: "existing",
    });

    const encoded = serializePersistedEditorSession({
      levelset,
      selectedLevelIndex: 0,
      fileName: "session.c2m",
    });

    expect(parsePersistedEditorSession(encoded)).toEqual({
      levelset,
      selectedLevelIndex: 0,
      fileName: "session.c2m",
    });
  });

  it("migrates the legacy single-document session shape", () => {
    const doc = {
      ...createEmptyC2mDoc(),
      title: "Legacy Session",
    };
    const parsed = parsePersistedEditorSession(
      JSON.stringify({
        schema: "c2mTools.web.editorSession.v1",
        fileName: "legacy.c2m",
        documentJson: JSON.stringify(doc),
      }),
    );

    expect(parsed?.fileName).toBe("legacy.c2m");
    expect(parsed?.selectedLevelIndex).toBe(0);
    expect(parsed?.levelset.setName).toBe("Legacy Session");
    expect(parsed?.levelset.c2g.entries.map((entry) => entry.relativePath)).toEqual(["legacy.c2m"]);
    expect(parsed?.levelset.levels).toHaveLength(1);
    expect(parsed?.levelset.levels[0]?.relativePath).toBe("legacy.c2m");
    expect(parsed?.levelset.levels[0]?.source).toBe("existing");
    expect(parsed?.levelset.levels[0]?.doc).toEqual(doc);
  });

  it("rejects invalid stored session blobs", () => {
    expect(parsePersistedEditorSession("not json")).toBeNull();
    expect(
      parsePersistedEditorSession(
        JSON.stringify({
          schema: "c2mTools.web.editorSession.v2",
          fileName: "",
          levelsetJson: "{}",
        }),
      ),
    ).toBeNull();
  });
});
