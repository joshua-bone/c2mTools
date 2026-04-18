import { describe, expect, it } from "vitest";

import {
  C2M_LEVELSET_JSON_V1_SCHEMA,
  createLevelsetEntry,
  createSingleLevelset,
  getSelectedLevelEntry,
  replaceLevelsetEntryDoc,
} from "../src/c2g/c2gLevelsetJsonV1.js";
import { createMinimalC2gText, parseC2gText } from "../src/c2g/c2gText.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import {
  commitHistoryEvent,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "../web/src/editor/editorHistory.js";

describe("editor history", () => {
  it("tracks selected level replacement with undo and redo", () => {
    const baseDoc = createEmptyC2mDoc();
    const withTitle = {
      ...baseDoc,
      title: "Alpha",
    };
    const withAuthor = {
      ...withTitle,
      author: "Joshua Bone",
    };

    const baseLevelset = createSingleLevelset(baseDoc, {
      fileName: "001_alpha.c2m",
      source: "existing",
    });
    const titledLevelset = replaceLevelsetEntryDoc(baseLevelset, 0, withTitle);
    const authoredLevelset = replaceLevelsetEntryDoc(titledLevelset, 0, withAuthor);

    let history = createEditorHistory(baseLevelset);
    history = commitHistoryEvent(history, {
      type: "replace-levelset",
      levelset: titledLevelset,
    });
    history = commitHistoryEvent(history, {
      type: "replace-levelset",
      levelset: authoredLevelset,
    });

    expect(getSelectedLevelEntry(history.doc, history.selectedLevelIndex)?.doc).toEqual(withAuthor);

    history = undoEditorHistory(history);
    expect(getSelectedLevelEntry(history.doc, history.selectedLevelIndex)?.doc).toEqual(withTitle);

    history = undoEditorHistory(history);
    expect(getSelectedLevelEntry(history.doc, history.selectedLevelIndex)?.doc).toEqual(baseDoc);

    history = redoEditorHistory(history);
    expect(getSelectedLevelEntry(history.doc, history.selectedLevelIndex)?.doc).toEqual(withTitle);

    history = redoEditorHistory(history);
    expect(getSelectedLevelEntry(history.doc, history.selectedLevelIndex)?.doc).toEqual(withAuthor);
  });

  it("tracks selected level changes and drops the redo branch after a new edit", () => {
    const firstDoc = {
      ...createEmptyC2mDoc(),
      title: "First",
    };
    const secondDoc = {
      ...createEmptyC2mDoc(),
      title: "Second",
    };
    const thirdDoc = {
      ...createEmptyC2mDoc(),
      title: "Third",
    };

    const baseLevelset = {
      schema: C2M_LEVELSET_JSON_V1_SCHEMA,
      setName: "History Set",
      c2gFileName: "set.c2g",
      levels: [
        createLevelsetEntry(firstDoc, { relativePath: "001_first.c2m", source: "existing" }),
        createLevelsetEntry(secondDoc, { relativePath: "002_second.c2m", source: "existing" }),
      ],
      c2g: parseC2gText(createMinimalC2gText("History Set", ["001_first.c2m", "002_second.c2m"])),
    } as const;

    let history = createEditorHistory(baseLevelset);
    history = commitHistoryEvent(history, {
      type: "select-level",
      selectedLevelIndex: 1,
    });

    expect(history.selectedLevelIndex).toBe(1);
    expect(getSelectedLevelEntry(history.doc, history.selectedLevelIndex)?.doc.title).toBe(
      "Second",
    );

    history = undoEditorHistory(history);
    expect(history.selectedLevelIndex).toBe(0);

    history = commitHistoryEvent(history, {
      type: "replace-levelset",
      levelset: replaceLevelsetEntryDoc(baseLevelset, 0, thirdDoc),
    });

    expect(getSelectedLevelEntry(history.doc, history.selectedLevelIndex)?.doc.title).toBe("Third");
    expect(redoEditorHistory(history)).toBe(history);
  });
});
