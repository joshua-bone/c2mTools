import { describe, expect, it } from "vitest";

import { decodeMapBytesToJson, encodeMapJsonToBytes } from "../src/c2m/mapCodec.js";

const CARDINAL_DIRS = ["N", "E", "S", "W"] as const;
const FACED_LOGIC_GATES = [
  "INVERTER",
  "AND",
  "OR",
  "XOR",
  "LATCH_CW",
  "LATCH_CCW",
  "NAND",
] as const;

function logicGateWires(
  gate: (typeof FACED_LOGIC_GATES)[number],
  facing: (typeof CARDINAL_DIRS)[number],
) {
  const left = facing === "N" ? "W" : facing === "E" ? "N" : facing === "S" ? "E" : "S";
  const right = facing === "N" ? "E" : facing === "E" ? "S" : facing === "S" ? "W" : "N";
  const opposite = facing === "N" ? "S" : facing === "E" ? "W" : facing === "S" ? "N" : "E";
  const dirs = gate === "INVERTER" ? [facing, opposite] : [facing, left, right];
  return CARDINAL_DIRS.filter((dir) => dirs.includes(dir));
}

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

  it("round-trips railroad track modifiers that fit in a single byte", () => {
    const map = {
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "RAILROAD_TRACK",
          modifiers: [
            { kind: "TRACKS", pieces: ["TURN_SE", "TURN_SW"], active: "SE", entered: "N" },
          ],
        },
      ],
    } as const;

    expect(decodeMapBytesToJson(encodeMapJsonToBytes(map))).toEqual(map);
  });

  it("canonicalizes logic gate wire metadata down to a single logic modifier", () => {
    const map = {
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "LOGIC_GATE",
          modifiers: [
            { kind: "WIRES", wires: ["E", "W"], tunnels: [] },
            { kind: "LOGIC", gate: "INVERTER", facing: "W" },
          ],
        },
      ],
    } as const;

    expect(Array.from(encodeMapJsonToBytes(map))).toEqual([1, 1, 0x76, 0x03, 0x5c]);
    expect(decodeMapBytesToJson(encodeMapJsonToBytes(map))).toEqual({
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "LOGIC_GATE",
          modifiers: [{ kind: "LOGIC", gate: "INVERTER", facing: "W" }],
        },
      ],
    });
  });

  it("decodes legacy wire-first logic gate bytes as the intended gate", () => {
    expect(decodeMapBytesToJson(Uint8Array.from([1, 1, 0x76, 0x0a, 0x76, 0x03, 0x5c]))).toEqual({
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "LOGIC_GATE",
          modifiers: [{ kind: "LOGIC", gate: "INVERTER", facing: "W" }],
        },
      ],
    });
  });

  it("encodes every faced logic gate without a separate wires modifier", () => {
    for (const gate of FACED_LOGIC_GATES) {
      for (const facing of CARDINAL_DIRS) {
        const map = {
          width: 1,
          height: 1,
          tiles: [
            {
              tile: "LOGIC_GATE",
              modifiers: [
                { kind: "WIRES", wires: logicGateWires(gate, facing), tunnels: [] },
                { kind: "LOGIC", gate, facing },
              ],
            },
          ],
        } as const;
        const canonical = {
          width: 1,
          height: 1,
          tiles: [
            {
              tile: "LOGIC_GATE",
              modifiers: [{ kind: "LOGIC", gate, facing }],
            },
          ],
        } as const;

        expect(decodeMapBytesToJson(encodeMapJsonToBytes(map))).toEqual(canonical);
        expect(Array.from(encodeMapJsonToBytes(map))).toEqual(
          Array.from(encodeMapJsonToBytes(canonical)),
        );
      }
    }
  });

  it("round-trips counter logic gates for every digit", () => {
    for (let counterValue = 0; counterValue <= 9; counterValue += 1) {
      const map = {
        width: 1,
        height: 1,
        tiles: [
          {
            tile: "LOGIC_GATE",
            modifiers: [{ kind: "LOGIC", gate: "COUNTER", counterValue }],
          },
        ],
      } as const;

      expect(decodeMapBytesToJson(encodeMapJsonToBytes(map))).toEqual(map);
    }
  });

  it("preserves zero-valued inverter north logic modifiers", () => {
    const map = {
      width: 1,
      height: 1,
      tiles: [
        {
          tile: "LOGIC_GATE",
          modifiers: [{ kind: "LOGIC", gate: "INVERTER", facing: "N" }],
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
