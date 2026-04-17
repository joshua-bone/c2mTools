import { parseC2mJsonV1, stringifyC2mJsonV1, type C2mJsonV1 } from "../../src/c2m/c2mJsonV1.js";

export type AppViewMode = "board" | "json";

export const APP_PREFERENCES_STORAGE_KEY = "c2mtools-app-preferences";
export const EDITOR_SESSION_STORAGE_KEY = "c2mtools-editor-session";

const PERSISTED_APP_PREFERENCES_SCHEMA = "c2mTools.web.appPreferences.v1";
const PERSISTED_EDITOR_SESSION_SCHEMA = "c2mTools.web.editorSession.v1";

export type PersistedAppPreferences = Readonly<{
  viewMode: AppViewMode;
  leftPanelWidth: number;
  rightPanelWidth: number;
}>;

export type PersistedEditorSession = Readonly<{
  doc: C2mJsonV1;
  fileName: string;
}>;

export const DEFAULT_PERSISTED_APP_PREFERENCES: PersistedAppPreferences = {
  viewMode: "board",
  leftPanelWidth: 236,
  rightPanelWidth: 320,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePersistedAppPreferences(value: string | null): PersistedAppPreferences {
  if (!value) return DEFAULT_PERSISTED_APP_PREFERENCES;

  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed) || parsed.schema !== PERSISTED_APP_PREFERENCES_SCHEMA) {
      return DEFAULT_PERSISTED_APP_PREFERENCES;
    }

    return {
      viewMode:
        parsed.viewMode === "json"
          ? "json"
          : parsed.viewMode === "board" || parsed.viewMode === "image"
            ? "board"
            : DEFAULT_PERSISTED_APP_PREFERENCES.viewMode,
      leftPanelWidth:
        typeof parsed.leftPanelWidth === "number" && Number.isFinite(parsed.leftPanelWidth)
          ? parsed.leftPanelWidth
          : DEFAULT_PERSISTED_APP_PREFERENCES.leftPanelWidth,
      rightPanelWidth:
        typeof parsed.rightPanelWidth === "number" && Number.isFinite(parsed.rightPanelWidth)
          ? parsed.rightPanelWidth
          : DEFAULT_PERSISTED_APP_PREFERENCES.rightPanelWidth,
    };
  } catch {
    return DEFAULT_PERSISTED_APP_PREFERENCES;
  }
}

export function serializePersistedAppPreferences(preferences: PersistedAppPreferences): string {
  return JSON.stringify({
    schema: PERSISTED_APP_PREFERENCES_SCHEMA,
    ...preferences,
  });
}

export function parsePersistedEditorSession(value: string | null): PersistedEditorSession | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed) || parsed.schema !== PERSISTED_EDITOR_SESSION_SCHEMA) {
      return null;
    }

    if (typeof parsed.documentJson !== "string") return null;
    if (typeof parsed.fileName !== "string" || parsed.fileName.trim().length === 0) return null;

    return {
      doc: parseC2mJsonV1(JSON.parse(parsed.documentJson)),
      fileName: parsed.fileName,
    };
  } catch {
    return null;
  }
}

export function serializePersistedEditorSession(session: PersistedEditorSession): string {
  return JSON.stringify({
    schema: PERSISTED_EDITOR_SESSION_SCHEMA,
    fileName: session.fileName,
    documentJson: stringifyC2mJsonV1(session.doc),
  });
}
