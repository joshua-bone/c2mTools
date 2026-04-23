import { describe, expect, it } from "vitest";

import {
  applyIceMazeEditorBrush,
  buildIceMazeRegionInput,
  createEmptyIceMazeEditorState,
  createSampleIceMazeEditorState,
  resizeIceMazeEditorState,
} from "../web/src/iceMazeEditorState.js";

describe("ice maze editor state", () => {
  it("builds region input from painted region cells and anchors", () => {
    let state = createEmptyIceMazeEditorState(8, 6);
    state = applyIceMazeEditorBrush(
      state,
      { x: 3, y: 3 },
      { kind: "region", regionCell: "reserved" },
    );
    state = applyIceMazeEditorBrush(state, { x: 1, y: 1 }, { kind: "anchor", anchor: "entry" });
    state = applyIceMazeEditorBrush(state, { x: 6, y: 4 }, { kind: "anchor", anchor: "exit" });

    const regionInput = buildIceMazeRegionInput(state, "test-lab");
    expect(regionInput.mask.kind).toBe("points");
    if (regionInput.mask.kind !== "points") {
      throw new Error("expected points mask");
    }

    expect(regionInput.name).toBe("test-lab");
    expect(regionInput.board).toEqual({ width: 8, height: 6 });
    expect(regionInput.mask.points).toContainEqual({ x: 1, y: 1 });
    expect(regionInput.mask.points).toContainEqual({ x: 3, y: 3 });
    expect(regionInput.reservedPoints).toEqual([{ x: 3, y: 3 }]);
    expect(regionInput.anchors).toEqual([
      {
        id: "entry",
        kind: "entry",
        point: { x: 1, y: 1 },
      },
      {
        id: "exit",
        kind: "exit",
        point: { x: 6, y: 4 },
      },
    ]);
  });

  it("resizes state while preserving overlapping cells and dropping out-of-bounds anchors", () => {
    let state = createSampleIceMazeEditorState();
    state = resizeIceMazeEditorState(state, 6, 6);

    expect(state.map.width).toBe(6);
    expect(state.map.height).toBe(6);
    expect(state.anchors.entry).toEqual({ x: 1, y: 5 });
    expect(state.anchors.exit).toBeNull();
  });
});
