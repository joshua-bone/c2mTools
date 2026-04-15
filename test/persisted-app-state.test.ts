import { describe, expect, it } from "vitest";

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
    });

    expect(parsePersistedAppPreferences(encoded)).toEqual({
      viewMode: "board",
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
  it("round-trips the current document snapshot", () => {
    const doc = {
      ...createEmptyC2mDoc(),
      title: "Session Title",
    };

    const encoded = serializePersistedEditorSession({
      doc,
      fileName: "session.c2m",
    });

    expect(parsePersistedEditorSession(encoded)).toEqual({
      doc,
      fileName: "session.c2m",
    });
  });

  it("rejects invalid stored session blobs", () => {
    expect(parsePersistedEditorSession("not json")).toBeNull();
    expect(
      parsePersistedEditorSession(
        JSON.stringify({
          schema: "c2mTools.web.editorSession.v1",
          fileName: "",
          documentJson: "{}",
        }),
      ),
    ).toBeNull();
  });
});
