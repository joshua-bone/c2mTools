import { describe, expect, it } from "vitest";

import { createDefaultMirrorState, getDefaultMirrorOffset } from "../web/src/boardMirrors.js";

describe("board mirror defaults", () => {
  it("anchors diagonal mirrors to the top corners regardless of board size", () => {
    expect(getDefaultMirrorOffset("diag-desc", { width: 32, height: 32 })).toBe(0);
    expect(getDefaultMirrorOffset("diag-desc", { width: 24, height: 40 })).toBe(0);
    expect(getDefaultMirrorOffset("diag-asc", { width: 32, height: 32 })).toBe(31);
    expect(getDefaultMirrorOffset("diag-asc", { width: 24, height: 40 })).toBe(23);
  });

  it("builds an inactive default mirror state from those corner diagonals", () => {
    expect(createDefaultMirrorState({ width: 24, height: 40 })).toMatchObject({
      horizontal: { active: false, offset: 20 },
      "diag-desc": { active: false, offset: 0 },
      vertical: { active: false, offset: 12 },
      "diag-asc": { active: false, offset: 23 },
    });
  });
});
