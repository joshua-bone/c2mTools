import { describe, expect, it } from "vitest";

import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import {
  commitHistoryEvent,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "../web/src/editor/editorHistory.js";

describe("editor history", () => {
  it("tracks document replacement with undo and redo", () => {
    const baseDoc = createEmptyC2mDoc();
    const withTitle = {
      ...baseDoc,
      title: "Alpha",
    };
    const withAuthor = {
      ...withTitle,
      author: "Joshua Bone",
    };

    let history = createEditorHistory(baseDoc);
    history = commitHistoryEvent(history, {
      type: "replace-doc",
      doc: withTitle,
    });
    history = commitHistoryEvent(history, {
      type: "replace-doc",
      doc: withAuthor,
    });

    expect(history.doc).toEqual(withAuthor);

    history = undoEditorHistory(history);
    expect(history.doc).toEqual(withTitle);

    history = undoEditorHistory(history);
    expect(history.doc).toEqual(baseDoc);

    history = redoEditorHistory(history);
    expect(history.doc).toEqual(withTitle);

    history = redoEditorHistory(history);
    expect(history.doc).toEqual(withAuthor);
  });

  it("drops the redo branch after a new edit is committed", () => {
    const baseDoc = createEmptyC2mDoc();
    const withTitle = {
      ...baseDoc,
      title: "Alpha",
    };
    const withAuthor = {
      ...baseDoc,
      author: "Joshua Bone",
    };

    let history = createEditorHistory(baseDoc);
    history = commitHistoryEvent(history, {
      type: "replace-doc",
      doc: withTitle,
    });

    history = undoEditorHistory(history);
    history = commitHistoryEvent(history, {
      type: "replace-doc",
      doc: withAuthor,
    });

    expect(history.doc).toEqual(withAuthor);
    expect(redoEditorHistory(history)).toBe(history);
  });
});
