import { parseC2mJsonV1, type C2mJsonV1 } from "../../../src/c2m/c2mJsonV1.js";

export type C2mMetadataDraft = Readonly<{
  fileVersion: string;
  title: string;
  author: string;
  editorVersion: string;
  clue: string;
  note: string;
  lock: string;
  readOnlyChunk: boolean;
  time: string;
  editorWindow: string;
  verifiedReplay: string;
  hideMap: string;
  readOnlyOption: string;
  hideLogic: string;
  cc1Boots: string;
  blobPatterns: string;
}>;

export type C2mNumericOptionField =
  | "time"
  | "editorWindow"
  | "verifiedReplay"
  | "hideMap"
  | "readOnlyOption"
  | "hideLogic"
  | "cc1Boots"
  | "blobPatterns";

const OPTION_LIMITS: Readonly<
  Record<C2mNumericOptionField, Readonly<{ min: number; max: number }>>
> = {
  time: { min: 0, max: 0xffff },
  editorWindow: { min: 0, max: 0xff },
  verifiedReplay: { min: 0, max: 0xff },
  hideMap: { min: 0, max: 0xff },
  readOnlyOption: { min: 0, max: 0xff },
  hideLogic: { min: 0, max: 0xff },
  cc1Boots: { min: 0, max: 0xff },
  blobPatterns: { min: 0, max: 0xff },
};

function stringValue(value: string | undefined): string {
  return value ?? "";
}

function fileVersionValue(value: string | undefined): string {
  return value?.replace(/\0+$/g, "") ?? "";
}

function numericValue(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function numericValueWithDefault(value: number | undefined, defaultValue: number): string {
  return value === undefined ? String(defaultValue) : String(value);
}

function blankToUndefined(value: string): string | undefined {
  return value.length === 0 ? undefined : value;
}

function fileVersionToStoredValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return `${trimmed}\0`;
}

function parseOptionalIntegerString(
  value: string,
  field: C2mNumericOptionField,
): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${field} must be an integer`);
  }

  const parsed = Number(trimmed);
  const limits = OPTION_LIMITS[field];
  if (!Number.isInteger(parsed) || parsed < limits.min || parsed > limits.max) {
    throw new Error(`${field} must be between ${limits.min} and ${limits.max}`);
  }

  return parsed;
}

export function makeMetadataDraft(doc: C2mJsonV1): C2mMetadataDraft {
  const options = doc.options ?? {};

  return {
    fileVersion: fileVersionValue(doc.fileVersion) || "7",
    title: stringValue(doc.title),
    author: stringValue(doc.author),
    editorVersion: stringValue(doc.editorVersion),
    clue: stringValue(doc.clue),
    note: stringValue(doc.note),
    lock: stringValue(doc.lock),
    readOnlyChunk: doc.readOnlyChunk === true,
    time: numericValue(options.time),
    editorWindow: numericValueWithDefault(options.editorWindow, 0),
    verifiedReplay: numericValueWithDefault(options.verifiedReplay, 0),
    hideMap: numericValueWithDefault(options.hideMap, 0),
    readOnlyOption: numericValueWithDefault(options.readOnlyOption, 0),
    hideLogic: numericValueWithDefault(options.hideLogic, 0),
    cc1Boots: numericValueWithDefault(options.cc1Boots, 0),
    blobPatterns: numericValueWithDefault(options.blobPatterns, 2),
  };
}

export function metadataDraftEquals(a: C2mMetadataDraft, b: C2mMetadataDraft): boolean {
  return (
    a.fileVersion === b.fileVersion &&
    a.title === b.title &&
    a.author === b.author &&
    a.editorVersion === b.editorVersion &&
    a.clue === b.clue &&
    a.note === b.note &&
    a.lock === b.lock &&
    a.readOnlyChunk === b.readOnlyChunk &&
    a.time === b.time &&
    a.editorWindow === b.editorWindow &&
    a.verifiedReplay === b.verifiedReplay &&
    a.hideMap === b.hideMap &&
    a.readOnlyOption === b.readOnlyOption &&
    a.hideLogic === b.hideLogic &&
    a.cc1Boots === b.cc1Boots &&
    a.blobPatterns === b.blobPatterns
  );
}

export function applyMetadataDraft(doc: C2mJsonV1, draft: C2mMetadataDraft): C2mJsonV1 {
  const time = parseOptionalIntegerString(draft.time, "time");
  const editorWindow = parseOptionalIntegerString(draft.editorWindow, "editorWindow");
  const verifiedReplay = parseOptionalIntegerString(draft.verifiedReplay, "verifiedReplay");
  const hideMap = parseOptionalIntegerString(draft.hideMap, "hideMap");
  const readOnlyOption = parseOptionalIntegerString(draft.readOnlyOption, "readOnlyOption");
  const hideLogic = parseOptionalIntegerString(draft.hideLogic, "hideLogic");
  const cc1Boots = parseOptionalIntegerString(draft.cc1Boots, "cc1Boots");
  const blobPatterns = parseOptionalIntegerString(draft.blobPatterns, "blobPatterns");
  const optionValues: NonNullable<C2mJsonV1["options"]> = {
    ...(time !== undefined ? { time } : {}),
    ...(editorWindow !== undefined ? { editorWindow } : {}),
    ...(verifiedReplay !== undefined ? { verifiedReplay } : {}),
    ...(hideMap !== undefined ? { hideMap } : {}),
    ...(readOnlyOption !== undefined ? { readOnlyOption } : {}),
    ...(hideLogic !== undefined ? { hideLogic } : {}),
    ...(cc1Boots !== undefined ? { cc1Boots } : {}),
    ...(blobPatterns !== undefined ? { blobPatterns } : {}),
    ...(doc.options?.replayHash ? { replayHash: doc.options.replayHash } : {}),
    ...(doc.options?.extra ? { extra: doc.options.extra } : {}),
  };

  const nextOptions =
    doc.options !== undefined || Object.keys(optionValues).length > 0 ? optionValues : undefined;

  return parseC2mJsonV1({
    ...doc,
    fileVersion: fileVersionToStoredValue(draft.fileVersion),
    title: blankToUndefined(draft.title),
    author: blankToUndefined(draft.author),
    editorVersion: blankToUndefined(draft.editorVersion),
    clue: blankToUndefined(draft.clue),
    note: blankToUndefined(draft.note),
    lock: blankToUndefined(draft.lock),
    readOnlyChunk: draft.readOnlyChunk === true ? true : undefined,
    options: nextOptions,
  });
}
