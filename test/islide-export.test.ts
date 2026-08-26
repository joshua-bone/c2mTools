import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeDefaultISlideArtifacts } from "../procedural_generation/generateISlide.js";
import { validateISlideC2m } from "../procedural_generation/islide_replay.js";
import { decodeC2mToJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { flattenCellLayers } from "../src/c2m/cellStack.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("default I SLIDE artifact export", () => {
  it("writes reproducible playable and self-contained graph deliverables", () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "c2mtools-islide-export-"));
    temporaryDirectories.push(outputDirectory);

    const first = writeDefaultISlideArtifacts(outputDirectory);
    const firstC2m = fs.readFileSync(first.c2mPath);
    const firstGraphJson = fs.readFileSync(first.graphJsonPath, "utf8");
    const firstGraphSvg = fs.readFileSync(first.graphSvgPath, "utf8");
    const second = writeDefaultISlideArtifacts(outputDirectory);

    expect(path.basename(first.c2mPath)).toBe("i-slide-99.c2m");
    expect(path.basename(first.graphJsonPath)).toBe("i-slide-99.graph.json");
    expect(path.basename(first.graphSvgPath)).toBe("i-slide-99.graph.svg");
    expect(fs.readFileSync(second.c2mPath)).toEqual(firstC2m);
    expect(fs.readFileSync(second.graphJsonPath, "utf8")).toBe(firstGraphJson);
    expect(fs.readFileSync(second.graphSvgPath, "utf8")).toBe(firstGraphSvg);

    const validation = validateISlideC2m(firstC2m, {
      expectedReplayHashHex: first.replayHashHex,
      policy: "generated-strict",
    });
    expect(validation).toMatchObject({
      ok: true,
      engineOutcome: "won",
      chipsLeft: 0,
      postInputTicks: 0,
      width: 99,
      height: 99,
    });

    const graphDocument = JSON.parse(firstGraphJson) as Record<string, unknown>;
    const decodedC2m = decodeC2mToJsonV1(firstC2m);
    expect(graphDocument).toMatchObject({
      schemaVersion: "c2mtools.islide.graph.v1",
      level: {
        title: "I SLIDE SO HARD",
        author: "Joshua Bone",
        note: "Procedurally generated.",
        hint: {
          point: { x: 49, y: 47 },
          text: "But in the end, does it even matter?",
        },
        width: 99,
        height: 99,
        fingerprint: first.fingerprint,
      },
      replay: {
        hashMd5: first.replayHashHex,
        validation: {
          ok: true,
          engineOutcome: "won",
          chipsLeft: 0,
        },
      },
      finalArm: {
        kind: "unique-socket-to-exit",
        socketNodeId: "socket",
        exitNodeId: "exit",
        allChipsCollectedBeforeEntry: true,
      },
    });
    const graph = graphDocument.graph as { nodes: Array<{ role: string }> };
    const graphEdges = (graphDocument.graph as { edges: Array<{ id: string }> }).edges;
    const edgeLabels = graphDocument.edgeLabels as Array<{
      edgeId: string;
      displayId: string;
      point: { x: number; y: number };
    }>;
    const level = graphDocument.level as { requiredChips: number };
    const solution = graphDocument.solution as { collectedChipNodeIds: string[] };
    const finalArm = graphDocument.finalArm as {
      graphEdgeId: string;
      nodeIds: string[];
      edgeIds: string[];
    };
    const actualChipCount = graph.nodes.filter((node) => node.role === "chip").length;
    const physicalChipCount = decodedC2m.map!.tiles.filter(
      (tile) => flattenCellLayers(tile).item?.tile === "IC_CHIP",
    ).length;
    expect(level.requiredChips).toBe(actualChipCount);
    expect(level.requiredChips).toBe(physicalChipCount);
    expect(solution.collectedChipNodeIds).toHaveLength(actualChipCount);
    expect(new Set(solution.collectedChipNodeIds).size).toBe(actualChipCount);
    expect(edgeLabels).toHaveLength(graphEdges.length);
    expect(edgeLabels).toEqual(
      graphEdges.map((edge, index) => ({
        edgeId: edge.id,
        displayId: `E${String(index + 1).padStart(3, "0")}`,
        point: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      })),
    );
    expect(finalArm.nodeIds).toEqual(["socket", "exit"]);
    expect(finalArm.edgeIds).toEqual([finalArm.graphEdgeId]);

    expect(firstGraphSvg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(firstGraphSvg).toContain("I SLIDE SO HARD — 99 × 99 solution route graph");
    expect(firstGraphSvg).toContain('data-edge-id="slide-final-exit"');
    expect(firstGraphSvg).toContain('<g id="unique-final-arm"');
    expect(firstGraphSvg).toContain("FINAL ARM: SOCKET → EXIT");
    expect(firstGraphSvg).toContain('<g id="edge-labels"');
    expect(firstGraphSvg).toContain(`class="edge-label" data-edge-id="${graphEdges[0]!.id}"`);
    expect(firstGraphSvg).toContain(">E001</text>");
    expect(firstGraphSvg).toContain(`>E${String(graphEdges.length).padStart(3, "0")}</text>`);
    expect(firstGraphSvg).not.toMatch(/<(?:script|image|foreignObject)\b/i);
    expect(firstGraphSvg).not.toMatch(/\b(?:href|src)=["'](?:https?:|\/\/|data:)/i);
  }, 120_000);
});
