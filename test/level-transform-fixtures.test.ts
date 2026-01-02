import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { decodeC2mToJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { encodeMapJsonToBytes } from "../src/c2m/mapCodec.js";
import { transformMap } from "../src/c2m/levelTransform.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "c2m");

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function applyN<T>(x: T, n: number, f: (v: T) => T): T {
  let cur = x;
  for (let i = 0; i < n; i++) cur = f(cur);
  return cur;
}

describe("Level transforms: fixture group laws", () => {
  it("for every fixture: 4 rotates and 2 flips return original map bytes", async () => {
    const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".c2m"))
      .map((e) => e.name)
      .sort();

    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const full = path.join(FIXTURES_DIR, name);
      const bytes = await readFile(full);

      try {
        const doc = decodeC2mToJsonV1(bytes);
        if (!doc.map) throw new Error("missing map");

        const base = encodeMapJsonToBytes(doc.map);

        // Dimension sanity checks
        {
          const r90 = transformMap(doc.map, "ROTATE_90");
          expect(r90.width, `${name}: rotate90 width`).toBe(doc.map.height);
          expect(r90.height, `${name}: rotate90 height`).toBe(doc.map.width);

          const r180 = transformMap(doc.map, "ROTATE_180");
          expect(r180.width, `${name}: rotate180 width`).toBe(doc.map.width);
          expect(r180.height, `${name}: rotate180 height`).toBe(doc.map.height);

          const d1 = transformMap(doc.map, "FLIP_DIAG_NWSE");
          expect(d1.width, `${name}: diagNWSE width`).toBe(doc.map.height);
          expect(d1.height, `${name}: diagNWSE height`).toBe(doc.map.width);
        }

        // 4x rotate90 = identity
        {
          const m = applyN(doc.map, 4, (v) => transformMap(v, "ROTATE_90"));
          const out = encodeMapJsonToBytes(m);
          expect(bytesEqual(out, base), `${name}: rotate90 x4`).toBe(true);
        }

        // 2x rotate180 = identity
        {
          const m = applyN(doc.map, 2, (v) => transformMap(v, "ROTATE_180"));
          const out = encodeMapJsonToBytes(m);
          expect(bytesEqual(out, base), `${name}: rotate180 x2`).toBe(true);
        }

        // 4x rotate270 = identity
        {
          const m = applyN(doc.map, 4, (v) => transformMap(v, "ROTATE_270"));
          const out = encodeMapJsonToBytes(m);
          expect(bytesEqual(out, base), `${name}: rotate270 x4`).toBe(true);
        }

        // 2x flips = identity
        for (const op of ["FLIP_H", "FLIP_V", "FLIP_DIAG_NWSE", "FLIP_DIAG_NESW"] as const) {
          const m = applyN(doc.map, 2, (v) => transformMap(v, op));
          const out = encodeMapJsonToBytes(m);
          expect(bytesEqual(out, base), `${name}: ${op} x2`).toBe(true);
        }

        // rotate90 then rotate270 = identity
        {
          const m = transformMap(transformMap(doc.map, "ROTATE_90"), "ROTATE_270");
          const out = encodeMapJsonToBytes(m);
          expect(bytesEqual(out, base), `${name}: rotate90 then rotate270`).toBe(true);
        }

        // rotate90 twice equals rotate180
        {
          const a = encodeMapJsonToBytes(applyN(doc.map, 2, (v) => transformMap(v, "ROTATE_90")));
          const b = encodeMapJsonToBytes(transformMap(doc.map, "ROTATE_180"));
          expect(bytesEqual(a, b), `${name}: rotate90^2 == rotate180`).toBe(true);
        }

        // flipH then flipV equals rotate180
        {
          const a = encodeMapJsonToBytes(transformMap(transformMap(doc.map, "FLIP_H"), "FLIP_V"));
          const b = encodeMapJsonToBytes(transformMap(doc.map, "ROTATE_180"));
          expect(bytesEqual(a, b), `${name}: flipH+flipV == rotate180`).toBe(true);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`${name}: ${msg}`);
      }
    }
  });
});
