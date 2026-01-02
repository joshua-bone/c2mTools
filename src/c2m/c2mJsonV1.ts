import { BinaryReader, BinaryWriter } from "./binary.js";
import { decodeCp1252, encodeCp1252 } from "./cp1252.js";
import { packC2mLiteralOnly, unpackC2mPacked } from "./pack.js";

export type WarnFn = (msg: string) => void;

export type Base64Blob = {
  encoding: "base64";
  dataBase64: string;
};

export type C2mJsonV1 = {
  schema: "c2mTools.c2m.json.v1";

  fileVersion?: string;
  lock?: string;
  title?: string;
  author?: string;
  editorVersion?: string;
  clue?: string;
  note?: string;

  options?: {
    time?: number; // u16
    editorWindow?: number; // u8
    verifiedReplay?: number; // u8
    hideMap?: number; // u8
    readOnlyOption?: number; // u8
    replayHash?: Base64Blob; // 16 bytes
    hideLogic?: number; // u8
    cc1Boots?: number; // u8
    blobPatterns?: number; // u8
    extra?: Base64Blob; // preserve any trailing bytes
  };

  readOnlyChunk?: boolean;

  // Canonical form: unpacked bytes base64
  map?: Base64Blob;
  key?: Base64Blob;
  replay?: Base64Blob;

  // Unknown / future-proof chunks: raw payload base64
  extraChunks?: Array<{ tag: string; data: Base64Blob }>;
};

const TAG_END = "END ";
const TAG_FILE_VERSION = "CC2M";
const TAG_LOCK = "LOCK";
const TAG_TITLE = "TITL";
const TAG_AUTHOR = "AUTH";
const TAG_EDITOR_VERSION = "VERS";
const TAG_CLUE = "CLUE";
const TAG_NOTE = "NOTE";
const TAG_OPTIONS = "OPTN";
const TAG_MAP = "MAP ";
const TAG_PACKED_MAP = "PACK";
const TAG_KEY = "KEY ";
const TAG_REPLAY = "REPL";
const TAG_PACKED_REPLAY = "PRPL";
const TAG_READ_ONLY = "RDNY";

function toBase64(bytes: Uint8Array): Base64Blob {
  return { encoding: "base64", dataBase64: Buffer.from(bytes).toString("base64") };
}

function fromBase64(blob: Base64Blob): Uint8Array {
  return Buffer.from(blob.dataBase64, "base64");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseBase64Blob(v: unknown, name: string): Base64Blob {
  if (!isRecord(v)) throw new Error(`Invalid ${name}: expected object`);
  const enc = v.encoding;
  const data = v.dataBase64;

  if (enc !== "base64") throw new Error(`Invalid ${name}.encoding (expected "base64")`);
  if (typeof data !== "string") throw new Error(`Invalid ${name}.dataBase64 (expected string)`);

  return { encoding: "base64", dataBase64: data };
}

function parseOptionalStringField(
  input: Record<string, unknown>,
  key: string,
  out: C2mJsonV1,
): void {
  const v = input[key];
  if (v === undefined) return;
  if (typeof v !== "string") throw new Error(`Invalid ${key}: expected string`);
  (out as Record<string, unknown>)[key] = v;
}

function parseOptionalIntField(
  input: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new Error(`Invalid ${key}: expected integer in [${min}, ${max}]`);
  }
  return v;
}

export function parseC2mJsonV1(input: unknown): C2mJsonV1 {
  if (!isRecord(input)) throw new Error("Invalid JSON: expected object");
  if (input.schema !== "c2mTools.c2m.json.v1") throw new Error("Invalid schema");

  const out: C2mJsonV1 = { schema: "c2mTools.c2m.json.v1" };

  parseOptionalStringField(input, "fileVersion", out);
  parseOptionalStringField(input, "lock", out);
  parseOptionalStringField(input, "title", out);
  parseOptionalStringField(input, "author", out);
  parseOptionalStringField(input, "editorVersion", out);
  parseOptionalStringField(input, "clue", out);
  parseOptionalStringField(input, "note", out);

  if (input.readOnlyChunk !== undefined) {
    if (typeof input.readOnlyChunk !== "boolean")
      throw new Error("Invalid readOnlyChunk: expected boolean");
    out.readOnlyChunk = input.readOnlyChunk;
  }

  if (input.map !== undefined) out.map = parseBase64Blob(input.map, "map");
  if (input.key !== undefined) out.key = parseBase64Blob(input.key, "key");
  if (input.replay !== undefined) out.replay = parseBase64Blob(input.replay, "replay");

  if (input.options !== undefined) {
    if (!isRecord(input.options)) throw new Error("Invalid options: expected object");
    const o = input.options;

    const opt: NonNullable<C2mJsonV1["options"]> = {};

    const time = parseOptionalIntField(o, "time", 0, 0xffff);
    if (time !== undefined) opt.time = time;

    const editorWindow = parseOptionalIntField(o, "editorWindow", 0, 0xff);
    if (editorWindow !== undefined) opt.editorWindow = editorWindow;

    const verifiedReplay = parseOptionalIntField(o, "verifiedReplay", 0, 0xff);
    if (verifiedReplay !== undefined) opt.verifiedReplay = verifiedReplay;

    const hideMap = parseOptionalIntField(o, "hideMap", 0, 0xff);
    if (hideMap !== undefined) opt.hideMap = hideMap;

    const readOnlyOption = parseOptionalIntField(o, "readOnlyOption", 0, 0xff);
    if (readOnlyOption !== undefined) opt.readOnlyOption = readOnlyOption;

    const hideLogic = parseOptionalIntField(o, "hideLogic", 0, 0xff);
    if (hideLogic !== undefined) opt.hideLogic = hideLogic;

    const cc1Boots = parseOptionalIntField(o, "cc1Boots", 0, 0xff);
    if (cc1Boots !== undefined) opt.cc1Boots = cc1Boots;

    const blobPatterns = parseOptionalIntField(o, "blobPatterns", 0, 0xff);
    if (blobPatterns !== undefined) opt.blobPatterns = blobPatterns;

    if (o.extra !== undefined) opt.extra = parseBase64Blob(o.extra, "options.extra");

    out.options = opt;
  }

  if (input.extraChunks !== undefined) {
    if (!Array.isArray(input.extraChunks)) throw new Error("Invalid extraChunks: expected array");
    const chunks: Array<{ tag: string; data: Base64Blob }> = [];

    for (let i = 0; i < input.extraChunks.length; i++) {
      const item = input.extraChunks[i];
      if (!isRecord(item)) throw new Error(`Invalid extraChunks[${i}]: expected object`);

      const tag = item.tag;
      if (typeof tag !== "string" || tag.length !== 4) {
        throw new Error(`Invalid extraChunks[${i}].tag: expected 4-char string`);
      }

      const data = parseBase64Blob(item.data, `extraChunks[${i}].data`);
      chunks.push({ tag, data });
    }

    out.extraChunks = chunks;
  }

  return out;
}

export function stringifyC2mJsonV1(doc: C2mJsonV1): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

export function decodeC2mToJsonV1(bytes: Uint8Array, warn: WarnFn = () => {}): C2mJsonV1 {
  const r = new BinaryReader(Buffer.from(bytes));
  const out: C2mJsonV1 = { schema: "c2mTools.c2m.json.v1" };
  const extraChunks: Array<{ tag: string; data: Base64Blob }> = [];

  let sawMap = false;
  let sawReplay = false;

  while (r.remaining() > 0) {
    const tag = r.readBytes(4).toString("ascii");
    if (tag === TAG_END) break;

    const len = r.readU32LE();
    const payload = r.readBytes(len);

    switch (tag) {
      case TAG_FILE_VERSION:
        out.fileVersion = decodeCp1252(payload);
        break;
      case TAG_LOCK:
        out.lock = decodeCp1252(payload);
        break;
      case TAG_TITLE:
        out.title = decodeCp1252(payload);
        break;
      case TAG_AUTHOR:
        out.author = decodeCp1252(payload);
        break;
      case TAG_EDITOR_VERSION:
        out.editorVersion = decodeCp1252(payload);
        break;
      case TAG_CLUE:
        out.clue = decodeCp1252(payload);
        break;
      case TAG_NOTE:
        out.note = decodeCp1252(payload);
        break;

      case TAG_OPTIONS: {
        const or = new BinaryReader(payload);
        const opt: NonNullable<C2mJsonV1["options"]> = {};

        if (or.remaining() >= 2) opt.time = or.readU16LE();
        if (or.remaining() >= 1) opt.editorWindow = or.readU8();
        if (or.remaining() >= 1) opt.verifiedReplay = or.readU8();
        if (or.remaining() >= 1) opt.hideMap = or.readU8();
        if (or.remaining() >= 1) opt.readOnlyOption = or.readU8();
        if (or.remaining() >= 16) opt.replayHash = toBase64(or.readBytes(16));
        if (or.remaining() >= 1) opt.hideLogic = or.readU8();
        if (or.remaining() >= 1) opt.cc1Boots = or.readU8();
        if (or.remaining() >= 1) opt.blobPatterns = or.readU8();
        if (or.remaining() > 0) opt.extra = toBase64(or.readBytes(or.remaining()));

        out.options = opt;
        break;
      }

      case TAG_READ_ONLY:
        if (len !== 0) throw new Error(`RDNY must have length 0, got ${len}`);
        out.readOnlyChunk = true;
        break;

      case TAG_PACKED_MAP:
        if (sawMap) {
          extraChunks.push({ tag, data: toBase64(payload) });
        } else {
          out.map = toBase64(unpackC2mPacked(payload));
          sawMap = true;
        }
        break;

      case TAG_MAP:
        warn(`MAP  section found (unpacked). Expected PACK for fixtures.`);
        if (sawMap) {
          extraChunks.push({ tag, data: toBase64(payload) });
        } else {
          out.map = toBase64(payload);
          sawMap = true;
        }
        break;

      case TAG_KEY:
        out.key = toBase64(payload);
        break;

      case TAG_PACKED_REPLAY:
        if (sawReplay) {
          extraChunks.push({ tag, data: toBase64(payload) });
        } else {
          out.replay = toBase64(unpackC2mPacked(payload));
          sawReplay = true;
        }
        break;

      case TAG_REPLAY:
        warn(`REPL section found (unpacked).`);
        if (sawReplay) {
          extraChunks.push({ tag, data: toBase64(payload) });
        } else {
          out.replay = toBase64(payload);
          sawReplay = true;
        }
        break;

      default:
        extraChunks.push({ tag, data: toBase64(payload) });
        break;
    }
  }

  if (extraChunks.length > 0) out.extraChunks = extraChunks;
  return out;
}

function findLastIndex<T>(arr: ReadonlyArray<T>, pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return i;
  }
  return -1;
}

export function encodeC2mFromJsonV1(doc: C2mJsonV1): Uint8Array {
  if (doc.schema !== "c2mTools.c2m.json.v1") {
    throw new Error(`Unsupported schema: ${doc.schema}`);
  }

  const w = new BinaryWriter();

  const writeText = (tag: string, value: string | undefined): void => {
    if (value === undefined) return;
    const bytes = encodeCp1252(value);
    w.writeTag4(tag);
    w.writeU32LE(bytes.length);
    w.writeBytes(bytes);
  };

  const writeRaw = (tag: string, bytes: Uint8Array | undefined): void => {
    if (bytes === undefined) return;
    w.writeTag4(tag);
    w.writeU32LE(bytes.length);
    w.writeBytes(bytes);
  };

  // Text fields
  writeText(TAG_FILE_VERSION, doc.fileVersion);
  writeText(TAG_LOCK, doc.lock);
  writeText(TAG_TITLE, doc.title);
  writeText(TAG_AUTHOR, doc.author);
  writeText(TAG_EDITOR_VERSION, doc.editorVersion);
  writeText(TAG_CLUE, doc.clue);
  writeText(TAG_NOTE, doc.note);

  // OPTN (prefix record + trailing extra)
  if (doc.options) {
    const o = doc.options;
    const ow = new BinaryWriter();

    const steps: Array<{ name: string; present: boolean; write: () => void }> = [
      {
        name: "time",
        present: o.time !== undefined,
        write: () => ow.writeU16LE(o.time as number),
      },
      {
        name: "editorWindow",
        present: o.editorWindow !== undefined,
        write: () => ow.writeU8(o.editorWindow as number),
      },
      {
        name: "verifiedReplay",
        present: o.verifiedReplay !== undefined,
        write: () => ow.writeU8(o.verifiedReplay as number),
      },
      {
        name: "hideMap",
        present: o.hideMap !== undefined,
        write: () => ow.writeU8(o.hideMap as number),
      },
      {
        name: "readOnlyOption",
        present: o.readOnlyOption !== undefined,
        write: () => ow.writeU8(o.readOnlyOption as number),
      },
      {
        name: "replayHash",
        present: o.replayHash !== undefined,
        write: () => {
          const rh = fromBase64(o.replayHash as Base64Blob);
          if (rh.length !== 16)
            throw new Error(`options.replayHash must be 16 bytes, got ${rh.length}`);
          ow.writeBytes(rh);
        },
      },
      {
        name: "hideLogic",
        present: o.hideLogic !== undefined,
        write: () => ow.writeU8(o.hideLogic as number),
      },
      {
        name: "cc1Boots",
        present: o.cc1Boots !== undefined,
        write: () => ow.writeU8(o.cc1Boots as number),
      },
      {
        name: "blobPatterns",
        present: o.blobPatterns !== undefined,
        write: () => ow.writeU8(o.blobPatterns as number),
      },
    ];

    const last = findLastIndex(steps, (s) => s.present);
    if (last !== -1) {
      for (let i = 0; i <= last; i++) {
        if (!steps[i]!.present) {
          throw new Error(
            `options must be a prefix record: missing options.${steps[i]!.name} while later fields are present`,
          );
        }
      }
      for (let i = 0; i <= last; i++) steps[i]!.write();
    }

    if (o.extra) {
      const extra = fromBase64(o.extra);
      ow.writeBytes(extra);
    }

    const payload = ow.toBuffer();
    if (payload.length > 0) {
      w.writeTag4(TAG_OPTIONS);
      w.writeU32LE(payload.length);
      w.writeBytes(payload);
    }
  }

  // Canonical: write PACK from unpacked map bytes
  if (doc.map) {
    const unpacked = fromBase64(doc.map);
    const packed = packC2mLiteralOnly(unpacked);
    writeRaw(TAG_PACKED_MAP, packed);
  }

  if (doc.key) {
    writeRaw(TAG_KEY, fromBase64(doc.key));
  }

  // Canonical: write PRPL from unpacked replay bytes
  if (doc.replay) {
    const unpacked = fromBase64(doc.replay);
    const packed = packC2mLiteralOnly(unpacked);
    writeRaw(TAG_PACKED_REPLAY, packed);
  }

  if (doc.readOnlyChunk) {
    w.writeTag4(TAG_READ_ONLY);
    w.writeU32LE(0);
  }

  if (doc.extraChunks) {
    for (const c of doc.extraChunks) {
      if (typeof c.tag !== "string" || c.tag.length !== 4) {
        throw new Error(`extraChunks tag must be a 4-char string, got '${String(c.tag)}'`);
      }
      const payload = fromBase64(c.data);
      writeRaw(c.tag, payload);
    }
  }

  w.writeTag4(TAG_END);
  return w.toBuffer();
}
