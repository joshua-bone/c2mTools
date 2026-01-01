import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  c2mBytesToOpaqueJsonV1,
  opaqueJsonV1ToC2mBytes
} from "../src/c2m/opaque/codec.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "c2m");

describe("opaque C2M <-> JSON round-trip (byte-for-byte)", () => {
  it("round-trips every .c2m fixture", async () => {
    const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".c2m"))
      .map((e) => e.name)
      .sort();

    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const full = path.join(FIXTURES_DIR, name);
      const original = await readFile(full);

      const json = c2mBytesToOpaqueJsonV1(original);
      const reconstructed = opaqueJsonV1ToC2mBytes(json);

      expect(Buffer.from(reconstructed)).toEqual(original);
    }
  });

  it("fails if sha256 is wrong (tamper detection)", async () => {
    const original = await readFile(path.join(FIXTURES_DIR, "001 - Island Beginnings.c2m"));
    const json = c2mBytesToOpaqueJsonV1(original);

    const tampered = { ...json, sha256: "0".repeat(64) as string };
    expect(() => opaqueJsonV1ToC2mBytes(tampered)).toThrow(/mismatch/i);
  });
});
