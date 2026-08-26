import { describe, expect, it } from "vitest";

import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { flattenCellLayers } from "../src/c2m/cellStack.js";
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
  }, 120_000);

  it("round-trips verified replay metadata through the C2M codec", () => {
    const layout = generateISlideLayout({
      ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
      chipCount: 24,
      branchCount: 5,
      loopCount: 1,
    });
    const artifact = buildISlideC2mArtifact(layout);
    const decoded = decodeC2mToJsonV1(artifact.c2mBytes);
    const requiredChips = layout.graph.nodes.filter((node) => node.role === "chip").length;

    expect(decoded).toMatchObject({
      title: "I SLIDE SO HARD",
      author: "Joshua Bone",
      note: "Procedurally generated.",
      clue: "But in the end, does it even matter?",
    });
    expect(decoded.options?.verifiedReplay).toBe(1);
    expect(decoded.options?.time).toBe(0);
    expect(decoded.replay?.dataBase64).toBe(Buffer.from(artifact.replayBytes).toString("base64"));
    expect(Buffer.from(decoded.options!.replayHash!.dataBase64, "base64").toString("hex")).toBe(
      artifact.replayHashHex,
    );
    expect(
      decoded.map!.tiles.filter((tile) => flattenCellLayers(tile).item?.tile === "IC_CHIP"),
    ).toHaveLength(requiredChips);
    const hintPoints = decoded.map!.tiles.flatMap((tile, index) =>
      flattenCellLayers(tile).terrain.tile === "CLUE"
        ? [{ x: index % decoded.map!.width, y: Math.floor(index / decoded.map!.width) }]
        : [],
    );
    expect(hintPoints).toEqual([{ x: 49, y: 47 }]);
  });

  it("rejects inconsistent artifact identities and chip inventories before replay construction", () => {
    const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
    const firstNode = layout.graph.nodes[0]!;
    const firstEdge = layout.graph.edges[0]!;
    const firstCollectedChipId = layout.solution.collectedChipNodeIds[0]!;
    const firstNonChipId = layout.graph.nodes.find((node) => node.role !== "chip")!.id;
    const requiredChips = layout.graph.nodes.filter((node) => node.role === "chip").length;
    const physicalChipIndex = layout.map.tiles.findIndex(
      (tile) => flattenCellLayers(tile).item?.tile === "IC_CHIP",
    );
    expect(physicalChipIndex).toBeGreaterThanOrEqual(0);
    const tilesWithMissingChip = [...layout.map.tiles];
    tilesWithMissingChip[physicalChipIndex] = "FLOOR";

    expect(() =>
      buildISlideC2mArtifact({
        ...layout,
        graph: { ...layout.graph, nodes: [...layout.graph.nodes, firstNode] },
      }),
    ).toThrow(`I SLIDE graph contains duplicate node id "${firstNode.id}".`);
    expect(() =>
      buildISlideC2mArtifact({
        ...layout,
        graph: { ...layout.graph, edges: [...layout.graph.edges, firstEdge] },
      }),
    ).toThrow(`I SLIDE graph contains duplicate edge id "${firstEdge.id}".`);
    expect(() =>
      buildISlideC2mArtifact({
        ...layout,
        solution: {
          ...layout.solution,
          collectedChipNodeIds: [...layout.solution.collectedChipNodeIds, firstCollectedChipId],
        },
      }),
    ).toThrow(`I SLIDE solution collects chip id "${firstCollectedChipId}" more than once.`);
    expect(() =>
      buildISlideC2mArtifact({
        ...layout,
        solution: {
          ...layout.solution,
          collectedChipNodeIds: [firstNonChipId, ...layout.solution.collectedChipNodeIds.slice(1)],
        },
      }),
    ).toThrow(
      `I SLIDE graph and solution disagree about collected chip id "${firstCollectedChipId}".`,
    );
    expect(() =>
      buildISlideC2mArtifact({
        ...layout,
        map: { ...layout.map, tiles: tilesWithMissingChip },
      }),
    ).toThrow(
      `I SLIDE artifact chip counts disagree: map ${requiredChips - 1}, ` +
        `graph ${requiredChips}, solution ${requiredChips} unique.`,
    );
  });

  it("rejects mutated immutable metadata and hint placement", () => {
    const artifact = buildISlideC2mArtifact(
      generateISlideLayout({
        ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
        chipCount: 16,
        branchCount: 4,
        loopCount: 0,
      }),
    );
    const decoded = decodeC2mToJsonV1(artifact.c2mBytes);
    const tiles = [...decoded.map!.tiles];
    tiles[49 + 47 * decoded.map!.width] = "FLOOR";
    const tamperedBytes = encodeC2mFromJsonV1({
      ...decoded,
      title: "I SLIDE 99",
      author: "Someone Else",
      note: "Changed.",
      clue: "Changed.",
      map: { ...decoded.map!, tiles },
    });
    const validation = validateISlideC2m(tamperedBytes, {
      policy: "generated-strict",
    });

    expect(validation.ok).toBe(false);
    expect(validation.containerValid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        'Expected title "I SLIDE SO HARD".',
        'Expected author "Joshua Bone".',
        'Expected note "Procedurally generated.".',
        'Expected hint text "But in the end, does it even matter?".',
        "Expected exactly one HINT tile at (49,47).",
      ]),
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
