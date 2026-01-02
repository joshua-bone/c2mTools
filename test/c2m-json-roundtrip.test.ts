import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "c2m");

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

      const doc1 = decodeC2mToJsonV1(original, (m) => warnings.push(`${name}: ${m}`));
      const rebuiltBytes = encodeC2mFromJsonV1(doc1);
      const doc2 = decodeC2mToJsonV1(rebuiltBytes, () => {});

      expect(doc2).toEqual(doc1);
    }

    // Non-fatal per your request; surfaces if any fixture isn't PACK.
    if (warnings.length > 0) {
      console.warn("\nWarnings while decoding fixtures:\n" + warnings.join("\n"));
    }
  });
});
