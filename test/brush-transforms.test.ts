import { describe, expect, it } from "vitest";

import { rotateBrushSpec } from "../web/src/editor/brushTransforms.js";

describe("brush transforms", () => {
  it("rotates mob-facing brushes", () => {
    expect(rotateBrushSpec({ tile: "ANT", dir: "N", lower: "FLOOR" }, "clockwise")).toEqual({
      tile: "ANT",
      dir: "E",
      lower: "FLOOR",
    });
  });

  it("rotates railroad variants", () => {
    expect(
      rotateBrushSpec(
        {
          tile: "RAILROAD_TRACK",
          modifiers: [
            {
              kind: "TRACKS",
              pieces: ["VERTICAL", "TURN_NE"],
              active: "V",
              entered: "N",
            },
          ],
        },
        "clockwise",
      ),
    ).toEqual({
      tile: "RAILROAD_TRACK",
      modifiers: [
        {
          kind: "TRACKS",
          pieces: ["TURN_SE", "HORIZONTAL"],
          active: "H",
          entered: "E",
        },
      ],
    });
  });

  it("rotates directional terrain tile names", () => {
    expect(rotateBrushSpec("FORCE_N", "clockwise")).toBe("FORCE_E");
    expect(rotateBrushSpec("ICE_CORNER_NE", "clockwise")).toBe("ICE_CORNER_SE");
    expect(rotateBrushSpec("SWIVEL_DOOR_NE", "counterclockwise")).toBe("SWIVEL_DOOR_NW");
  });

  it("rotates directional block arrows with the brush", () => {
    expect(
      rotateBrushSpec(
        {
          tile: "DIRECTIONAL_BLOCK",
          dir: "N",
          directionalArrows: {
            arrows: ["N", "E"],
          },
          lower: "FLOOR",
        },
        "clockwise",
      ),
    ).toEqual({
      tile: "DIRECTIONAL_BLOCK",
      dir: "E",
      directionalArrows: {
        arrows: ["E", "S"],
      },
      lower: "FLOOR",
    });
  });

  it("cycles custom wall colors and letter symbols", () => {
    expect(
      rotateBrushSpec(
        {
          tile: "CUSTOM_WALL",
          modifiers: [{ kind: "CUSTOM_STYLE", style: "GREEN" }],
        },
        "clockwise",
      ),
    ).toEqual({
      tile: "CUSTOM_WALL",
      modifiers: [{ kind: "CUSTOM_STYLE", style: "PINK" }],
    });

    expect(
      rotateBrushSpec(
        {
          tile: "LETTER_TILE",
          modifiers: [{ kind: "LETTER_SYMBOL", symbol: "A" }],
        },
        "counterclockwise",
      ),
    ).toEqual({
      tile: "LETTER_TILE",
      modifiers: [{ kind: "LETTER_SYMBOL", symbol: "@" }],
    });

    expect(
      rotateBrushSpec(
        {
          tile: "LOGIC_GATE",
          modifiers: [{ kind: "LOGIC", gate: "COUNTER", counterValue: 9 }],
        },
        "clockwise",
      ),
    ).toEqual({
      tile: "LOGIC_GATE",
      modifiers: [{ kind: "LOGIC", gate: "COUNTER", counterValue: 0 }],
    });
  });

  it("rotates wire tunnels with their matching wire direction", () => {
    expect(
      rotateBrushSpec(
        {
          tile: "FLOOR",
          modifiers: [{ kind: "WIRES", wires: ["N"], tunnels: ["N"] }],
        },
        "clockwise",
      ),
    ).toEqual({
      tile: "FLOOR",
      modifiers: [{ kind: "WIRES", wires: ["E"], tunnels: ["E"] }],
    });
  });
});
