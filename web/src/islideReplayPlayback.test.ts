import { describe, expect, it } from "vitest";

import {
  DEFAULT_ISLIDE_GENERATOR_CONFIG,
  generateISlideLayout,
} from "../../procedural_generation/islide_generator.js";
import { buildISlideC2mArtifact } from "../../procedural_generation/islide_replay.js";
import { flattenCellLayers } from "../../src/c2m/cellStack.js";
import { createISlideReplayPlayback } from "./islideReplayPlayback.js";

describe("I SLIDE replay viewer acceptance", () => {
  it("drives the exact packaged replay through NotCC to a win", () => {
    const layout = generateISlideLayout({
      ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
      seed: "replay-viewer-atdd",
    });
    const artifact = buildISlideC2mArtifact(layout);
    const playback = createISlideReplayPlayback(artifact.c2mBytes, artifact.replayFrames);

    const initial = playback.snapshot();
    expect(initial).toMatchObject({
      source: "notcc-engine",
      elapsedSubticks: 0,
      totalSubticks: artifact.replayFrames,
      outcome: "playing",
    });
    expect(initial.chipsLeft).toBeGreaterThan(0);
    expect(initial.player).toBeDefined();

    let current = initial;
    while (current.outcome === "playing") {
      current = playback.advance(4_096);
    }

    expect(current.outcome).toBe("won");
    expect(current.chipsLeft).toBe(0);
    expect(current.elapsedSubticks).toBeLessThanOrEqual(artifact.replayFrames);
    expect(
      current.map.tiles.filter((tile) => flattenCellLayers(tile).item?.tile === "IC_CHIP"),
    ).toHaveLength(0);
  }, 120_000);

  it("resets deterministically and never advances beyond packaged input", () => {
    const artifact = buildISlideC2mArtifact(
      generateISlideLayout({
        ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
        seed: "replay-viewer-atdd",
      }),
    );
    const playback = createISlideReplayPlayback(artifact.c2mBytes, artifact.replayFrames);

    const first = playback.advance(120);
    const reset = playback.reset();
    const second = playback.advance(120);

    expect(reset.elapsedSubticks).toBe(0);
    expect(second.player).toEqual(first.player);
    expect(second.chipsLeft).toBe(first.chipsLeft);

    const finished = playback.advance(Number.MAX_SAFE_INTEGER);
    expect(finished.elapsedSubticks).toBeLessThanOrEqual(artifact.replayFrames);
    expect(finished.outcome).not.toBe("playing");
  }, 120_000);
});
