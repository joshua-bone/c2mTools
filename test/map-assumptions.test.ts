import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { decodeC2mToJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { encodeMapJsonToBytes } from "../src/c2m/mapCodec.js";
import { unpackC2mPacked } from "../src/c2m/pack.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "c2m");

function firstDiffIndex(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function hexWindow(buf: Uint8Array, center: number, radius = 24): string {
  const start = Math.max(0, center - radius);
  const end = Math.min(buf.length, center + radius);
  const slice = buf.slice(start, end);
  const hex = Array.from(slice, (x) => x.toString(16).padStart(2, "0")).join(" ");
  return `len=${buf.length} start=${start} end=${end}\n${hex}`;
}

// Minimal extractor for first PACK payload using the existing decoded sections (authoritative order)
function findPackedMapPayloadBase64(doc: any): string | null {
  const sections = doc.sections;
  if (!Array.isArray(sections)) return null;
  for (const s of sections) {
    if (
      s &&
      s.tag === "PACK" &&
      s.data &&
      s.data.encoding === "base64" &&
      typeof s.data.dataBase64 === "string"
    ) {
      return s.data.dataBase64;
    }
  }
  return null;
}

describe("Map assumptions: parsed map JSON re-encodes to identical unpacked MAP bytes", () => {
  it("encodeMapJsonToBytes(decodeMapBytesToJson(unpacked)) matches original unpacked bytes for every fixture", async () => {
    const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".c2m"))
      .map((e) => e.name)
      .sort();

    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const fullPath = path.join(FIXTURES_DIR, name);
      const original = await readFile(fullPath);

      const doc = decodeC2mToJsonV1(original);

      if (!doc.map) {
        throw new Error(`${name}: no parsed map found`);
      }

      const packedB64 = findPackedMapPayloadBase64(doc as unknown);
      if (!packedB64) {
        throw new Error(`${name}: no PACK section found in sections[]`);
      }

      const packed = Buffer.from(packedB64, "base64");
      const unpackedOrig = unpackC2mPacked(packed);

      const unpackedCanon = encodeMapJsonToBytes(doc.map);

      const diff = firstDiffIndex(unpackedOrig, unpackedCanon);
      if (diff !== -1) {
        throw new Error(
          [
            `${name}: unpacked MAP bytes mismatch at index ${diff}`,
            "",
            "ORIGINAL UNPACKED:",
            hexWindow(unpackedOrig, diff),
            "",
            "CANONICAL UNPACKED:",
            hexWindow(unpackedCanon, diff),
          ].join("\n"),
        );
      }
    }
  });
});
