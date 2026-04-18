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

  it("round-trips railroad wire modifiers alongside track metadata", () => {
    const map = {
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "RAILROAD_TRACK",
          modifiers: [
            { kind: "WIRES", wires: ["E"], tunnels: [] },
            { kind: "TRACKS", pieces: ["VERTICAL", "SWITCH"], active: "V", entered: "N" },
          ],
        },
      ],
    } as const;

    expect(decodeMapBytesToJson(encodeMapJsonToBytes(map))).toEqual(map);
  });

  it("round-trips logic gate wire modifiers alongside logic metadata", () => {
    const map = {
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "LOGIC_GATE",
          modifiers: [
            { kind: "WIRES", wires: ["E"], tunnels: [] },
            { kind: "LOGIC", gate: "AND", facing: "E" },
          ],
        },
      ],
    } as const;

    expect(decodeMapBytesToJson(encodeMapJsonToBytes(map))).toEqual(map);
  });

  it("round-trips toggle wire modifiers", () => {
    const map = {
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "GREEN_TOGGLE_FLOOR",
          modifiers: [{ kind: "WIRES", wires: ["E"], tunnels: [] }],
        },
      ],
    } as const;

    expect(decodeMapBytesToJson(encodeMapJsonToBytes(map))).toEqual(map);
  });
});
