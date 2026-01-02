import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { transformLevelJson } from "../src/c2m/levelTransform.js";

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

describe("Transform tool invariant: returning to identity yields byte-identical C2M", () => {
  it("all fixtures: rotate^4 and flip^2 return original binary bytes", async () => {
    const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".c2m"))
      .map((e) => e.name)
      .sort();

    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const full = path.join(FIXTURES_DIR, name);
      const original = await readFile(full);
      const doc0 = decodeC2mToJsonV1(original);

      const docR90 = applyN(doc0, 4, (d) => transformLevelJson(d, "ROTATE_90"));
      const bytesR90 = encodeC2mFromJsonV1(docR90);
      expect(bytesEqual(bytesR90, original), `${name}: rotate90 x4`).toBe(true);

      const docR180 = applyN(doc0, 2, (d) => transformLevelJson(d, "ROTATE_180"));
      const bytesR180 = encodeC2mFromJsonV1(docR180);
      expect(bytesEqual(bytesR180, original), `${name}: rotate180 x2`).toBe(true);

      const docR270 = applyN(doc0, 4, (d) => transformLevelJson(d, "ROTATE_270"));
      const bytesR270 = encodeC2mFromJsonV1(docR270);
      expect(bytesEqual(bytesR270, original), `${name}: rotate270 x4`).toBe(true);

      for (const op of ["FLIP_H", "FLIP_V", "FLIP_DIAG_NWSE", "FLIP_DIAG_NESW"] as const) {
        const docF = applyN(doc0, 2, (d) => transformLevelJson(d, op));
        const bytesF = encodeC2mFromJsonV1(docF);
        expect(bytesEqual(bytesF, original), `${name}: ${op} x2`).toBe(true);
      }
    }
  });
});
