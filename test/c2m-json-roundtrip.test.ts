import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  stringifyC2mJsonV1,
} from "../src/c2m/c2mJsonV1.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "c2m");

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function blobFp(blob: any): any {
  if (!blob) return undefined;
  const b64 = String(blob.dataBase64 ?? "");
  const bytes = Buffer.from(b64, "base64");
  return { bytes: bytes.length, sha256: sha256Hex(bytes) };
}

function docFp(doc: any): any {
  const opt = doc.options ?? undefined;
  return {
    schema: doc.schema,
    fileVersion: doc.fileVersion,
    title: doc.title,
    author: doc.author,
    editorVersion: doc.editorVersion,
    lock: doc.lock,
    clue: doc.clue,
    noteLen: typeof doc.note === "string" ? doc.note.length : undefined,

    options: opt
      ? {
          keys: Object.keys(opt).sort(),
          time: opt.time,
          editorWindow: opt.editorWindow,
          verifiedReplay: opt.verifiedReplay,
          hideMap: opt.hideMap,
          readOnlyOption: opt.readOnlyOption,
          replayHash: blobFp(opt.replayHash),
          hideLogic: opt.hideLogic,
          cc1Boots: opt.cc1Boots,
          blobPatterns: opt.blobPatterns,
          extra: blobFp(opt.extra),
        }
      : undefined,

    map: blobFp(doc.map),
    key: blobFp(doc.key),
    replay: blobFp(doc.replay),

    readOnlyChunk: doc.readOnlyChunk === true ? true : undefined,

    extraChunks: Array.isArray(doc.extraChunks)
      ? doc.extraChunks.map((c: any) => ({
          tag: c.tag,
          data: blobFp(c.data),
        }))
      : undefined,
  };
}

describe("C2M <-> JSON v1 round-trip (canonical map = unpacked bytes)", () => {
  it("round-trips all .c2m fixtures via JSON v1", async () => {
    const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".c2m"))
      .map((e) => e.name)
      .sort();

    expect(files.length).toBeGreaterThan(0);

    const warnings: string[] = [];

    for (const name of files) {
      const fullPath = path.join(FIXTURES_DIR, name);
      const original = await readFile(fullPath);

      try {
        const doc1 = decodeC2mToJsonV1(original, (m) => warnings.push(`${name}: ${m}`));

        // Match the React editor pipeline: stringify -> JSON.parse -> parseC2mJsonV1
        const jsonText = stringifyC2mJsonV1(doc1);
        const parsedUnknown = JSON.parse(jsonText) as unknown;
        const doc1FromJson = parseC2mJsonV1(parsedUnknown);

        const rebuiltBytes = encodeC2mFromJsonV1(doc1FromJson);
        const doc2 = decodeC2mToJsonV1(rebuiltBytes, () => {});

        try {
          expect(doc2).toEqual(doc1FromJson);
        } catch {
          const fp1 = docFp(doc1FromJson);
          const fp2 = docFp(doc2);
          throw new Error(
            `${name}: mismatch\nFROM_JSON:\n${JSON.stringify(fp1, null, 2)}\nREDECODED:\n${JSON.stringify(fp2, null, 2)}\n`,
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`${name}: ${msg}`);
      }
    }

    // Non-fatal per your request; surfaces if any fixture isn't PACK.
    if (warnings.length > 0) {
      console.warn("\nWarnings while decoding fixtures:\n" + warnings.join("\n"));
    }
  });
});
