import { describe, expect, it } from "vitest";

import { decodeC2mToJsonV1 } from "../src/c2m/c2mJsonV1.js";
import {
  DEFAULT_ISLIDE_GENERATOR_CONFIG,
  generateISlideLayout,
} from "../procedural_generation/islide_generator.js";
import {
  buildISlideC2mArtifact,
  validateISlideC2m,
} from "../procedural_generation/islide_replay.js";

describe("deterministic I SLIDE replay", () => {
  it("builds byte-identical C2M and replay bytes from identical controls", () => {
    const config = {
      ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
      chipCount: 32,
      branchCount: 6,
      loopCount: 1,
    };
    const first = buildISlideC2mArtifact(generateISlideLayout(config));
    const second = buildISlideC2mArtifact(generateISlideLayout(config));

    expect(first.c2mBytes).toEqual(second.c2mBytes);
    expect(first.replayBytes).toEqual(second.replayBytes);
    expect(first.replayHashHex).toBe(second.replayHashHex);
    expect(first.replayBytes.slice(0, 4)).toEqual(Uint8Array.from([0, 0, 0, 3]));
    expect(first.replayBytes.slice(-2)).toEqual(Uint8Array.from([0, 0xff]));
    expect(first.replayBytes.at(-4)).toBe(0);
    expect(first.replayBytes.at(-3)).toBeGreaterThan(0);
  });

  it("round-trips verified replay metadata through the C2M codec", () => {
    const artifact = buildISlideC2mArtifact(
      generateISlideLayout({
        ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
        chipCount: 24,
        branchCount: 5,
        loopCount: 1,
      }),
    );
    const decoded = decodeC2mToJsonV1(artifact.c2mBytes);

    expect(decoded.options?.verifiedReplay).toBe(1);
    expect(decoded.options?.time).toBe(0);
    expect(decoded.replay?.dataBase64).toBe(Buffer.from(artifact.replayBytes).toString("base64"));
    expect(Buffer.from(decoded.options!.replayHash!.dataBase64, "base64").toString("hex")).toBe(
      artifact.replayHashHex,
    );
  });

  it("wins under strict fresh-engine validation with no post-input grace", () => {
    const artifact = buildISlideC2mArtifact(
      generateISlideLayout({
        ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
        chipCount: 24,
        branchCount: 5,
        loopCount: 1,
      }),
    );
    const validation = validateISlideC2m(artifact.c2mBytes, {
      policy: "generated-strict",
    });

    expect(validation).toMatchObject({
      ok: true,
      policy: "generated-strict",
      containerValid: true,
      replayHashValid: true,
      verifiedFlagSet: true,
      engineOutcome: "won",
      postInputTicks: 0,
      chipsLeft: 0,
      width: 99,
      height: 99,
    });
  });

  it("rejects a replay hash mismatch independently of engine behavior", () => {
    const artifact = buildISlideC2mArtifact(
      generateISlideLayout({
        ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
        chipCount: 16,
        branchCount: 4,
        loopCount: 0,
      }),
    );
    const decoded = decodeC2mToJsonV1(artifact.c2mBytes);
    const tamperedBytes = Uint8Array.from(artifact.c2mBytes);
    const hash = Buffer.from(decoded.options!.replayHash!.dataBase64, "base64");

    expect(hash).toHaveLength(16);
    const validation = validateISlideC2m(tamperedBytes, {
      expectedReplayHashHex: "00".repeat(16),
      policy: "generated-strict",
    });

    expect(validation.ok).toBe(false);
    expect(validation.replayHashValid).toBe(false);
  });
});
