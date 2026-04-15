import { describe, expect, it } from "vitest";

import { decodeMapBytesToJson, encodeMapJsonToBytes } from "../src/c2m/mapCodec.js";

describe("empty wire nodes", () => {
  it("round-trips explicit empty wire modifiers", () => {
    const map = {
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "FLOOR",
          modifiers: [{ kind: "WIRES", wires: [], tunnels: [] }],
        },
      ],
    } as const;

    expect(decodeMapBytesToJson(encodeMapJsonToBytes(map))).toEqual(map);
  });
});
