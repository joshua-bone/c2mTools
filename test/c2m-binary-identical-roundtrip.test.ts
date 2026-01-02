import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  stringifyC2mJsonV1,
} from "../src/c2m/c2mJsonV1.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "c2m");

function firstDiffIndex(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function hexWindow(buf: Uint8Array, center: number, radius = 16): string {
  const start = Math.max(0, center - radius);
  const end = Math.min(buf.length, center + radius);
  const slice = buf.slice(start, end);
  const hex = Array.from(slice, (x) => x.toString(16).padStart(2, "0")).join(" ");
  return `len=${buf.length} start=${start} end=${end}\n${hex}`;
}

it("byte-identical: open -> JSON text -> parse -> save produces identical bytes for all fixtures", async () => {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".c2m"))
    .map((e) => e.name)
    .sort();

  expect(files.length).toBeGreaterThan(0);

  for (const name of files) {
    const fullPath = path.join(FIXTURES_DIR, name);
    const original = await readFile(fullPath);

    try {
      const doc = decodeC2mToJsonV1(original);
      const jsonText = stringifyC2mJsonV1(doc);
      const parsed = parseC2mJsonV1(JSON.parse(jsonText) as unknown);
      const rebuilt = encodeC2mFromJsonV1(parsed);

      const a = new Uint8Array(original);
      const b = new Uint8Array(rebuilt);

      const diff = firstDiffIndex(a, b);
      if (diff !== -1) {
        throw new Error(
          [
            `${name}: bytes differ at index ${diff}`,
            "",
            "ORIGINAL:",
            hexWindow(a, diff),
            "",
            "REBUILT:",
            hexWindow(b, diff),
          ].join("\n"),
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${name}: ${msg}`);
    }
  }
});
