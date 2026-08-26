import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ISlideLayout } from "../../procedural_generation/islide_generator.js";
import ISlideStudioApp, { buildViewGraph } from "./ISlideStudioApp.js";

const fixtureLayout = {
  config: {
    seed: "acceptance-seed",
    chipCount: 2,
    branchCount: 0,
    loopCount: 0,
    sparkleDensity: 2,
    routeSpread: 0,
    asymmetry: 0,
  },
  map: { width: 99, height: 99, tiles: ["ICE"] },
  graph: {
    nodes: [
      { id: "start", point: { x: 49, y: 49 }, role: "start" },
      { id: "chip-a", point: { x: 31, y: 31 }, role: "chip" },
      { id: "hub", point: { x: 49, y: 45 }, role: "hub" },
      { id: "chip-b", point: { x: 61, y: 24 }, role: "chip" },
    ],
    edges: [
      {
        id: "slide-first-001",
        fromNodeId: "start",
        toNodeId: "chip-a",
        kind: "slide",
        entryDir: "N",
        exitDir: "W",
        path: [{ x: 49, y: 31 }],
      },
      {
        id: "walk-hub",
        fromNodeId: "hub",
        toNodeId: "chip-b",
        kind: "walk",
        entryDir: "E",
        exitDir: "E",
        path: [{ x: 61, y: 45 }],
      },
    ],
    chains: [],
  },
  solution: {
    nodeIds: ["start", "chip-a"],
    edgeIds: ["slide-first-001"],
    collectedChipNodeIds: ["chip-a"],
  },
  metrics: {
    completeCornerGroups: 2,
    cornerTileCount: 8,
    quadrantChipCounts: [1, 1, 0, 0],
    quadrantCornerGroupCounts: [1, 1, 0, 0],
    routeCrossings: 0,
    routeTileCount: 3,
  },
  fingerprint: "islide-v2-acceptance",
} as unknown as ISlideLayout;

describe("I SLIDE studio acceptance", () => {
  it("renders the full shell immediately while initial generation runs off-thread", () => {
    const html = renderToStaticMarkup(createElement(ISlideStudioApp));

    expect(html).toContain("Seed");
    expect(html).not.toContain('type="range"');
    expect(html).toContain("Generating level…");
    expect(html).toContain('aria-label="Level generation progress"');
    expect(html).toContain("Starting generation worker");
    expect(html).toContain("Preparing the first map");
    expect(html).toContain('value="i-slide-99"');
    expect(html).toContain('class="islideGenerateButton" type="button" disabled=""');
    expect(html).toContain("Download C2M</button>");
    expect(html).toContain("Validate replay</button>");
    expect(html).toContain("View replay</button>");
    expect(html).toContain("View replay");
    expect(html).toContain(">Replay<span");
    expect(html).not.toContain('class="islideMapRoutes"');
  });

  it("numbers graph chip titles by chip order rather than raw node order", () => {
    const chipLabels = buildViewGraph(fixtureLayout)
      .nodes.filter((node) => node.role === "chip")
      .map((node) => node.label);
    const chipCount = fixtureLayout.graph.nodes.filter((node) => node.role === "chip").length;

    expect(chipLabels).toEqual(
      Array.from({ length: chipCount }, (_, index) => `Chip ${index + 1}`),
    );
  });

  it("assigns every route edge a stable shared E-number and inspectable label point", () => {
    const graph = buildViewGraph(fixtureLayout);

    expect(graph.edges).toHaveLength(fixtureLayout.graph.edges.length);
    expect(graph.edges.map((edge) => edge.displayId)).toEqual(
      graph.edges.map((_, index) => `E${String(index + 1).padStart(3, "0")}`),
    );
    expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length);
    expect(graph.edges.every((edge) => Number.isFinite(edge.labelPoint.x))).toBe(true);
    expect(graph.edges.every((edge) => Number.isFinite(edge.labelPoint.y))).toBe(true);
    expect(graph.edges.some((edge) => edge.important)).toBe(true);
  });
});
