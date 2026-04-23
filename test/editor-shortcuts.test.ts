import { describe, expect, it } from "vitest";

import { isEditableShortcutTarget, resolveEditorShortcut } from "../web/src/editor/shortcuts.js";

describe("editor shortcuts", () => {
  it("resolves undo, redo, cut, copy, and paste commands", () => {
    expect(
      resolveEditorShortcut(
        {
          key: "z",
          metaKey: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "undo" });

    expect(
      resolveEditorShortcut(
        {
          key: "z",
          metaKey: true,
          ctrlKey: false,
          shiftKey: true,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "redo" });

    expect(
      resolveEditorShortcut(
        {
          key: "a",
          metaKey: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "select-all" });

    expect(
      resolveEditorShortcut(
        {
          key: "x",
          metaKey: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: true,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "cut-selection" });

    expect(
      resolveEditorShortcut(
        {
          key: "c",
          metaKey: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: true,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "copy-selection" });

    expect(
      resolveEditorShortcut(
        {
          key: "v",
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: true,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "start-paste-preview" });
  });

  it("resolves tool shortcuts and selection commands", () => {
    expect(
      resolveEditorShortcut(
        {
          key: "n",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "next-level" });

    expect(
      resolveEditorShortcut(
        {
          key: "p",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "previous-level" });

    expect(
      resolveEditorShortcut(
        {
          key: "r",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "set-tool", tool: "wire" });

    expect(
      resolveEditorShortcut(
        {
          key: "i",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "set-tool", tool: "eyedropper" });

    expect(
      resolveEditorShortcut(
        {
          key: "t",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "set-tool", tool: "text" });

    expect(
      resolveEditorShortcut(
        {
          key: "Delete",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: true,
          hasClipboard: false,
          pastePreviewActive: false,
        },
      ),
    ).toEqual({ type: "erase-selection" });

    expect(
      resolveEditorShortcut(
        {
          key: "Escape",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: true,
          pastePreviewActive: true,
        },
      ),
    ).toEqual({ type: "cancel-selection" });

    expect(
      resolveEditorShortcut(
        {
          key: "Enter",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        {
          hasSelection: false,
          hasClipboard: true,
          pastePreviewActive: true,
        },
      ),
    ).toEqual({ type: "commit-paste-preview" });
  });

  it("detects editable targets", () => {
    expect(isEditableShortcutTarget({ tagName: "input" } as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(
      true,
    );
    expect(isEditableShortcutTarget({ tagName: "button" } as unknown as EventTarget)).toBe(false);
  });
});
