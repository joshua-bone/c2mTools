export type EditorToolMode =
  | "brush"
  | "text"
  | "line"
  | "fill"
  | "select"
  | "erase"
  | "wire"
  | "eyedropper";

export type EditorShortcutCommand =
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>
  | Readonly<{ type: "cut-selection" }>
  | Readonly<{ type: "copy-selection" }>
  | Readonly<{ type: "start-paste-preview" }>
  | Readonly<{ type: "commit-paste-preview" }>
  | Readonly<{ type: "cancel-selection" }>
  | Readonly<{ type: "erase-selection" }>
  | Readonly<{ type: "set-tool"; tool: EditorToolMode }>;

export type EditorShortcutContext = Readonly<{
  hasSelection: boolean;
  hasClipboard: boolean;
  pastePreviewActive: boolean;
}>;

export type ShortcutKeyEventLike = Readonly<{
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}>;

export const TOOL_SHORTCUTS: ReadonlyArray<
  Readonly<{
    id: EditorToolMode;
    label: string;
    shortcut: string;
  }>
> = Object.freeze([
  { id: "brush", label: "Brush", shortcut: "B" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "fill", label: "Bucket", shortcut: "F" },
  { id: "select", label: "Select", shortcut: "V" },
  { id: "erase", label: "Erase", shortcut: "E" },
  { id: "wire", label: "Wire", shortcut: "R" },
  { id: "eyedropper", label: "Eyedropper", shortcut: "I" },
]);

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (typeof target !== "object" || target === null) return false;

  if ("isContentEditable" in target && target.isContentEditable === true) return true;
  if (!("tagName" in target) || typeof target.tagName !== "string") return false;

  const tagName = target.tagName.toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function resolveEditorShortcut(
  event: ShortcutKeyEventLike,
  context: EditorShortcutContext,
): EditorShortcutCommand | null {
  const key = event.key.toLowerCase();
  const meta = event.metaKey || event.ctrlKey;

  if (meta && !event.altKey) {
    if (!event.shiftKey && key === "z") return { type: "undo" };
    if ((event.shiftKey && key === "z") || key === "y") return { type: "redo" };
    if (key === "x" && context.hasSelection) return { type: "cut-selection" };
    if (key === "c" && context.hasSelection) return { type: "copy-selection" };
    if (key === "v" && context.hasClipboard) return { type: "start-paste-preview" };
    return null;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) return null;

  if (key === "enter" && context.pastePreviewActive) return { type: "commit-paste-preview" };
  if (key === "escape" && (context.pastePreviewActive || context.hasSelection)) {
    return { type: "cancel-selection" };
  }
  if ((key === "backspace" || key === "delete") && context.hasSelection) {
    return { type: "erase-selection" };
  }
  if (key === "b") return { type: "set-tool", tool: "brush" };
  if (key === "t") return { type: "set-tool", tool: "text" };
  if (key === "l") return { type: "set-tool", tool: "line" };
  if (key === "f") return { type: "set-tool", tool: "fill" };
  if (key === "v") return { type: "set-tool", tool: "select" };
  if (key === "e") return { type: "set-tool", tool: "erase" };
  if (key === "r") return { type: "set-tool", tool: "wire" };
  if (key === "i") return { type: "set-tool", tool: "eyedropper" };

  return null;
}
