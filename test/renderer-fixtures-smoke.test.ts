import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { writeFile, readdir, readFile } from "node:fs/promises";
import * as pngjs from "pngjs";

import { decodeC2mToJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { CC2Tileset } from "../src/c2m/render/cc2Tileset.js";
import { CC2Renderer } from "../src/c2m/render/cc2Renderer.js";
import { applyChromaKeyInPlace, loadPngRgba, writePngRgba } from "../src/c2m/render/png.js";

const { PNG } = pngjs;

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "c2m");

async function makeDummySpritesheetPng(tmpPath: string): Promise<void> {
  // Large enough to cover all x/y used by the renderer (and small draws up to y=62 => 1024px).
  const w = 512;
  const h = 1024;
  const png = new PNG({ width: w, height: h });

  // Fill opaque black.
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    png.data[o + 0] = 0;
    png.data[o + 1] = 0;
    png.data[o + 2] = 0;
    png.data[o + 3] = 255;
  }

  // Set chroma key pixel (0,0) to a unique magenta.
  png.data[0] = 255;
  png.data[1] = 0;
  png.data[2] = 255;
  png.data[3] = 255;

  await writeFile(tmpPath, PNG.sync.write(png));
}

describe("renderer smoke: renders all fixtures to PNG (dummy spritesheet)", () => {
  it("renders without throwing and outputs correct dimensions", async () => {
    const tmpDir = await (async () => {
      const d = path.join(os.tmpdir(), `c2mtools_renderer_${Date.now()}`);
      return d;
    })();
    const sheetPath = path.join(tmpDir, "spritesheet.png");

    // Ensure tmp dir exists by writing file (parent)
    await writeFile(sheetPath, Buffer.from([])).catch(async () => {
      // create parent by writing after mkdir
    });

    // Create parent dir (portable)
    await (async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(tmpDir, { recursive: true });
    })();

    await makeDummySpritesheetPng(sheetPath);

    const sheet = await loadPngRgba(sheetPath);
    applyChromaKeyInPlace(sheet);

    const renderer = new CC2Renderer(new CC2Tileset(sheet));

    const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".c2m"))
      .map((e) => e.name)
      .sort();

    expect(files.length).toBeGreaterThan(0);

    const name = files[0]!;
    const bytes = await readFile(path.join(FIXTURES_DIR, name));
    const doc = decodeC2mToJsonV1(bytes);

    if (!doc.map) throw new Error(`${name}: missing map`);

    const pngBuf = renderer.renderLevelDocToPng(doc);

    // Validate PNG signature + parse dimensions.
    expect(pngBuf.subarray(0, 8).toString("hex"), `${name}: png signature`).toBe(
      "89504e470d0a1a0a",
    );

    const parsed = PNG.sync.read(pngBuf);
    expect(parsed.width, `${name}: width`).toBe(doc.map.width * 32);
    expect(parsed.height, `${name}: height`).toBe(doc.map.height * 32);

    // Also sanity-check round-trippable: re-encode should still be valid png
    const buf2 = writePngRgba({
      width: parsed.width,
      height: parsed.height,
      data: new Uint8Array(parsed.data),
    });
    expect(buf2.subarray(0, 8).toString("hex"), `${name}: png re-encode signature`).toBe(
      "89504e470d0a1a0a",
    );
  });
});
