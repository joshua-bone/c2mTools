import { describe, expect, it } from "vitest";

import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import {
  createEmptyC2mDoc,
  DEFAULT_C2M_MAP_SIZE,
  MAX_C2M_MAP_SIZE,
  MIN_C2M_MAP_SIZE,
} from "../web/src/editor/createEmptyC2mDoc.js";

describe("createEmptyC2mDoc", () => {
  it("creates a default 32x32 floor map with CC2 file version 7", () => {
    const doc = createEmptyC2mDoc();

    expect(doc.schema).toBe("c2mTools.c2m.json.v1");
    expect(doc.fileVersion).toBe("7\u0000");
    expect(doc.map?.width).toBe(DEFAULT_C2M_MAP_SIZE);
    expect(doc.map?.height).toBe(DEFAULT_C2M_MAP_SIZE);
    expect(doc.map?.tiles).toHaveLength(DEFAULT_C2M_MAP_SIZE * DEFAULT_C2M_MAP_SIZE);
    expect(doc.map?.tiles.every((tile) => tile === "FLOOR")).toBe(true);
  });

  it("round-trips through binary encoding and decoding", () => {
    const doc = createEmptyC2mDoc({
      width: MIN_C2M_MAP_SIZE,
      height: MAX_C2M_MAP_SIZE,
    });

    const rebuilt = decodeC2mToJsonV1(encodeC2mFromJsonV1(doc));

    expect(rebuilt.fileVersion).toBe(doc.fileVersion);
    expect(rebuilt.map).toEqual(doc.map);
  });

  it("rejects out-of-range map sizes", () => {
    expect(() => createEmptyC2mDoc({ width: MIN_C2M_MAP_SIZE - 1 })).toThrow(
      /between 10 and 100 inclusive/i,
    );
    expect(() => createEmptyC2mDoc({ height: MAX_C2M_MAP_SIZE + 1 })).toThrow(
      /between 10 and 100 inclusive/i,
    );
  });
});
