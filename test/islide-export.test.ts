import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeDefaultISlideArtifacts } from "../procedural_generation/generateISlide.js";
import { validateISlideC2m } from "../procedural_generation/islide_replay.js";

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
    expect(graphDocument).toMatchObject({
      schemaVersion: "c2mtools.islide.graph.v1",
      level: {
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
    const solution = graphDocument.solution as { collectedChipNodeIds: string[] };
    const finalArm = graphDocument.finalArm as {
      graphEdgeId: string;
      nodeIds: string[];
      edgeIds: string[];
    };
    expect(graph.nodes.filter((node) => node.role === "chip")).toHaveLength(99);
    expect(solution.collectedChipNodeIds).toHaveLength(99);
    expect(finalArm.nodeIds).toEqual(["socket", "exit"]);
    expect(finalArm.edgeIds).toEqual([finalArm.graphEdgeId]);

    expect(firstGraphSvg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(firstGraphSvg).toContain("I SLIDE 99 × 99 — solution route graph");
    expect(firstGraphSvg).toContain('data-edge-id="slide-final-exit"');
    expect(firstGraphSvg).toContain('<g id="unique-final-arm"');
    expect(firstGraphSvg).toContain("FINAL ARM: SOCKET → EXIT");
    expect(firstGraphSvg).not.toMatch(/<(?:script|image|foreignObject)\b/i);
    expect(firstGraphSvg).not.toMatch(/\b(?:href|src)=["'](?:https?:|\/\/|data:)/i);
  });
});
