import type { C2mJsonV1 } from "../../../src/c2m/c2mJsonV1.js";

export type C2mEditorEvent = Readonly<{
  type: "replace-doc";
  doc: C2mJsonV1;
}>;

export type C2mEditorHistory = Readonly<{
  baseDoc: C2mJsonV1;
  events: ReadonlyArray<C2mEditorEvent>;
  cursor: number;
  doc: C2mJsonV1;
}>;

function applyEditorEvent(doc: C2mJsonV1, event: C2mEditorEvent): C2mJsonV1 {
  switch (event.type) {
    case "replace-doc":
      return event.doc;
  }
}

function replayEditorEvents(
  baseDoc: C2mJsonV1,
  events: ReadonlyArray<C2mEditorEvent>,
  cursor: number,
): C2mJsonV1 {
  let doc = baseDoc;

  for (let index = 0; index < cursor; index += 1) {
    const event = events[index];
    if (!event) break;
    doc = applyEditorEvent(doc, event);
  }

  return doc;
}

export function createEditorHistory(baseDoc: C2mJsonV1): C2mEditorHistory {
  return {
    baseDoc,
    events: [],
    cursor: 0,
    doc: baseDoc,
  };
}

export function commitHistoryEvent(
  state: C2mEditorHistory,
  event: C2mEditorEvent,
): C2mEditorHistory {
  const events = [...state.events.slice(0, state.cursor), event];
  const doc = applyEditorEvent(state.doc, event);

  return {
    ...state,
    events,
    cursor: events.length,
    doc,
  };
}

export function undoEditorHistory(state: C2mEditorHistory): C2mEditorHistory {
  if (state.cursor === 0) return state;

  const cursor = state.cursor - 1;
  return {
    ...state,
    cursor,
    doc: replayEditorEvents(state.baseDoc, state.events, cursor),
  };
}

export function redoEditorHistory(state: C2mEditorHistory): C2mEditorHistory {
  if (state.cursor >= state.events.length) return state;

  const cursor = state.cursor + 1;
  return {
    ...state,
    cursor,
    doc: replayEditorEvents(state.baseDoc, state.events, cursor),
  };
}
