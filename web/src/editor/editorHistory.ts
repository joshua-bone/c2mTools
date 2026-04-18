import {
  clampSelectedLevelIndex,
  type C2mLevelsetJsonV1,
} from "../../../src/c2g/c2gLevelsetJsonV1.js";

export type C2mEditorEvent =
  | Readonly<{
      type: "replace-levelset";
      levelset: C2mLevelsetJsonV1;
      selectedLevelIndex?: number;
    }>
  | Readonly<{
      type: "select-level";
      selectedLevelIndex: number;
    }>;

export type C2mEditorHistory = Readonly<{
  baseDoc: C2mLevelsetJsonV1;
  events: ReadonlyArray<C2mEditorEvent>;
  cursor: number;
  doc: C2mLevelsetJsonV1;
  selectedLevelIndex: number;
}>;

function applyEditorEvent(
  doc: C2mLevelsetJsonV1,
  selectedLevelIndex: number,
  event: C2mEditorEvent,
): Readonly<{
  doc: C2mLevelsetJsonV1;
  selectedLevelIndex: number;
}> {
  switch (event.type) {
    case "replace-levelset":
      return {
        doc: event.levelset,
        selectedLevelIndex: clampSelectedLevelIndex(
          event.levelset,
          event.selectedLevelIndex ?? selectedLevelIndex,
        ),
      };
    case "select-level":
      return {
        doc,
        selectedLevelIndex: clampSelectedLevelIndex(doc, event.selectedLevelIndex),
      };
  }
}

function replayEditorEvents(
  baseDoc: C2mLevelsetJsonV1,
  events: ReadonlyArray<C2mEditorEvent>,
  cursor: number,
): Readonly<{
  doc: C2mLevelsetJsonV1;
  selectedLevelIndex: number;
}> {
  let doc = baseDoc;
  let selectedLevelIndex = 0;

  for (let index = 0; index < cursor; index += 1) {
    const event = events[index];
    if (!event) break;
    const nextState = applyEditorEvent(doc, selectedLevelIndex, event);
    doc = nextState.doc;
    selectedLevelIndex = nextState.selectedLevelIndex;
  }

  return { doc, selectedLevelIndex };
}

export function createEditorHistory(
  baseDoc: C2mLevelsetJsonV1,
  selectedLevelIndex = 0,
): C2mEditorHistory {
  return {
    baseDoc,
    events: [],
    cursor: 0,
    doc: baseDoc,
    selectedLevelIndex: clampSelectedLevelIndex(baseDoc, selectedLevelIndex),
  };
}

export function commitHistoryEvent(
  state: C2mEditorHistory,
  event: C2mEditorEvent,
): C2mEditorHistory {
  const events = [...state.events.slice(0, state.cursor), event];
  const nextState = applyEditorEvent(state.doc, state.selectedLevelIndex, event);

  return {
    ...state,
    events,
    cursor: events.length,
    doc: nextState.doc,
    selectedLevelIndex: nextState.selectedLevelIndex,
  };
}

export function undoEditorHistory(state: C2mEditorHistory): C2mEditorHistory {
  if (state.cursor === 0) return state;

  const cursor = state.cursor - 1;
  const nextState = replayEditorEvents(state.baseDoc, state.events, cursor);
  return {
    ...state,
    cursor,
    doc: nextState.doc,
    selectedLevelIndex: nextState.selectedLevelIndex,
  };
}

export function redoEditorHistory(state: C2mEditorHistory): C2mEditorHistory {
  if (state.cursor >= state.events.length) return state;

  const cursor = state.cursor + 1;
  const nextState = replayEditorEvents(state.baseDoc, state.events, cursor);
  return {
    ...state,
    cursor,
    doc: nextState.doc,
    selectedLevelIndex: nextState.selectedLevelIndex,
  };
}
