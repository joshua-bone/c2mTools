import {
  DEFAULT_ISLIDE_GENERATOR_CONFIG,
  generateISlideLayout,
  type ISlideGraphEdge,
  type ISlideLayout,
  type ISlidePoint,
} from "./islide_generator.js";
import {
  buildISlideC2mArtifact,
  ISLIDE_C2M_METADATA,
  type ISlideC2mArtifact,
} from "./islide_replay.js";

export const ISLIDE_EXPORT_FILE_NAMES = Object.freeze({
  c2m: "i-slide-99.c2m",
  graphJson: "i-slide-99.graph.json",
  graphSvg: "i-slide-99.graph.svg",
});

export type ISlideSolutionStep = Readonly<{
  sequence: number;
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  kind: ISlideGraphEdge["kind"];
  path: ReadonlyArray<ISlidePoint>;
}>;

export type ISlideEdgeLabel = Readonly<{
  edgeId: string;
  displayId: string;
  point: ISlidePoint;
}>;

export type ISlideGraphExportDocument = Readonly<{
  schemaVersion: "c2mtools.islide.graph.v1";
  level: Readonly<{
    title: typeof ISLIDE_C2M_METADATA.title;
    author: typeof ISLIDE_C2M_METADATA.author;
    note: typeof ISLIDE_C2M_METADATA.note;
    hint: Readonly<{
      point: typeof ISLIDE_C2M_METADATA.hintPoint;
      text: typeof ISLIDE_C2M_METADATA.hintText;
    }>;
    width: number;
    height: number;
    requiredChips: number;
    fingerprint: string;
    config: ISlideLayout["config"];
    metrics: ISlideLayout["metrics"];
  }>;
  graph: ISlideLayout["graph"];
  edgeLabels: ReadonlyArray<ISlideEdgeLabel>;
  solution: ISlideLayout["solution"];
  solutionSteps: ReadonlyArray<ISlideSolutionStep>;
  finalArm: ISlideFinalArm;
  replay: Readonly<{
    hashMd5: string;
    frames: number;
    bytes: number;
    validation: ISlideC2mArtifact["validation"];
  }>;
}>;

export type ISlideFinalArm = Readonly<{
  kind: "unique-socket-to-exit";
  socketNodeId: string;
  exitNodeId: string;
  graphEdgeId: string;
  nodeIds: ReadonlyArray<string>;
  edgeIds: ReadonlyArray<string>;
  firstSolutionStep: number;
  lastSolutionStep: number;
  allChipsCollectedBeforeEntry: true;
}>;

export type ISlideExportBundle = Readonly<{
  layout: ISlideLayout;
  artifact: ISlideC2mArtifact;
  graphDocument: ISlideGraphExportDocument;
  graphJson: string;
  graphSvg: string;
}>;

function samePoint(left: ISlidePoint, right: ISlidePoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function pointAlongPolyline(points: ReadonlyArray<ISlidePoint>, fraction: number): ISlidePoint {
  if (points.length === 0) return { x: 49, y: 49 };
  if (points.length === 1) return points[0]!;

  const lengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    lengths.push(length);
    totalLength += length;
  }
  if (totalLength === 0) return points[Math.floor(points.length / 2)]!;

  let remaining = totalLength * Math.min(1, Math.max(0, fraction));
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (remaining > length) {
      remaining -= length;
      continue;
    }
    const from = points[index]!;
    const to = points[index + 1]!;
    const progress = length === 0 ? 0 : remaining / length;
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  }
  return points.at(-1)!;
}

function buildEdgeLabels(layout: ISlideLayout): ISlideEdgeLabel[] {
  const nodesById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
  return layout.graph.edges.map((edge, index) => {
    const origin = nodesById.get(edge.fromNodeId);
    const destination = nodesById.get(edge.toNodeId);
    if (!origin) throw new Error(`I SLIDE edge "${edge.id}" has no origin node.`);
    if (!destination) throw new Error(`I SLIDE edge "${edge.id}" has no destination node.`);
    return {
      edgeId: edge.id,
      displayId: `E${String(index + 1).padStart(3, "0")}`,
      point: pointAlongPolyline([origin.point, ...edge.path, destination.point], 0.5),
    };
  });
}

function buildSolutionSteps(layout: ISlideLayout): ISlideSolutionStep[] {
  const nodesById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(layout.graph.edges.map((edge) => [edge.id, edge]));
  const steps: ISlideSolutionStep[] = [];

  if (layout.solution.nodeIds.length !== layout.solution.edgeIds.length + 1) {
    throw new Error("I SLIDE solution route must contain exactly one more node than edge.");
  }

  for (let index = 0; index < layout.solution.edgeIds.length; index += 1) {
    const edgeId = layout.solution.edgeIds[index]!;
    const fromNodeId = layout.solution.nodeIds[index]!;
    const toNodeId = layout.solution.nodeIds[index + 1]!;
    const edge = edgesById.get(edgeId);
    const fromNode = nodesById.get(fromNodeId);
    const toNode = nodesById.get(toNodeId);
    if (!edge || !fromNode || !toNode) {
      throw new Error(`I SLIDE solution step ${index + 1} references a missing graph member.`);
    }

    const forward = edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId;
    const reverse = edge.toNodeId === fromNodeId && edge.fromNodeId === toNodeId;
    if (!forward && !reverse) {
      throw new Error(`I SLIDE edge "${edge.id}" does not connect its solution step nodes.`);
    }

    const edgeFromNode = nodesById.get(edge.fromNodeId);
    if (!edgeFromNode) throw new Error(`I SLIDE edge "${edge.id}" has no origin node.`);
    const forwardPath = [edgeFromNode.point, ...edge.path];
    const orientedPath = forward ? forwardPath : [...forwardPath].reverse();
    if (!samePoint(orientedPath[0]!, fromNode.point)) {
      throw new Error(`I SLIDE edge "${edge.id}" path does not begin at its route origin.`);
    }
    if (!samePoint(orientedPath[orientedPath.length - 1]!, toNode.point)) {
      throw new Error(`I SLIDE edge "${edge.id}" path does not end at its route target.`);
    }

    steps.push({
      sequence: index + 1,
      edgeId,
      fromNodeId,
      toNodeId,
      kind: edge.kind,
      path: orientedPath,
    });
  }

  return steps;
}

function buildFinalArm(layout: ISlideLayout): ISlideFinalArm {
  const socketNodes = layout.graph.nodes.filter((node) => node.role === "socket");
  const exitNodes = layout.graph.nodes.filter((node) => node.role === "exit");
  if (socketNodes.length !== 1 || exitNodes.length !== 1) {
    throw new Error(
      `I SLIDE final arm requires one socket and one exit; found ${socketNodes.length} and ${exitNodes.length}.`,
    );
  }

  const socketNodeId = socketNodes[0]!.id;
  const exitNodeId = exitNodes[0]!.id;
  const socketToExitEdges = layout.graph.edges.filter(
    (edge) => edge.fromNodeId === socketNodeId && edge.toNodeId === exitNodeId,
  );
  const exitGraphEdges = layout.graph.edges.filter(
    (edge) => edge.fromNodeId === exitNodeId || edge.toNodeId === exitNodeId,
  );
  if (
    socketToExitEdges.length !== 1 ||
    exitGraphEdges.length !== 1 ||
    socketToExitEdges[0]!.id !== exitGraphEdges[0]!.id
  ) {
    throw new Error("I SLIDE final arm must be the exit's one-and-only-one route from the socket.");
  }

  const socketVisits = layout.solution.nodeIds
    .map((nodeId, index) => (nodeId === socketNodeId ? index : -1))
    .filter((index) => index >= 0);
  const exitVisits = layout.solution.nodeIds
    .map((nodeId, index) => (nodeId === exitNodeId ? index : -1))
    .filter((index) => index >= 0);
  if (socketVisits.length !== 1 || exitVisits.length !== 1) {
    throw new Error("I SLIDE solution must visit its socket and exit exactly once.");
  }

  const socketIndex = socketVisits[0]!;
  const exitIndex = exitVisits[0]!;
  if (exitIndex !== socketIndex + 1 || exitIndex !== layout.solution.nodeIds.length - 1) {
    throw new Error("I SLIDE solution must travel directly from the socket to the final exit.");
  }
  const chipVisitIndices = layout.solution.collectedChipNodeIds.map((nodeId) =>
    layout.solution.nodeIds.indexOf(nodeId),
  );
  if (chipVisitIndices.some((index) => index < 0 || index >= socketIndex)) {
    throw new Error(
      "I SLIDE solution must collect every required chip before entering the socket.",
    );
  }

  return {
    kind: "unique-socket-to-exit",
    socketNodeId,
    exitNodeId,
    graphEdgeId: socketToExitEdges[0]!.id,
    nodeIds: layout.solution.nodeIds.slice(socketIndex, exitIndex + 1),
    edgeIds: layout.solution.edgeIds.slice(socketIndex, exitIndex),
    firstSolutionStep: socketIndex + 1,
    lastSolutionStep: exitIndex,
    allChipsCollectedBeforeEntry: true,
  };
}

function buildGraphDocument(
  layout: ISlideLayout,
  artifact: ISlideC2mArtifact,
  edgeLabels: ReadonlyArray<ISlideEdgeLabel>,
  solutionSteps: ReadonlyArray<ISlideSolutionStep>,
  finalArm: ISlideFinalArm,
): ISlideGraphExportDocument {
  const requiredChips = layout.graph.nodes.filter((node) => node.role === "chip").length;
  return {
    schemaVersion: "c2mtools.islide.graph.v1",
    level: {
      title: ISLIDE_C2M_METADATA.title,
      author: ISLIDE_C2M_METADATA.author,
      note: ISLIDE_C2M_METADATA.note,
      hint: {
        point: ISLIDE_C2M_METADATA.hintPoint,
        text: ISLIDE_C2M_METADATA.hintText,
      },
      width: layout.map.width,
      height: layout.map.height,
      requiredChips,
      fingerprint: layout.fingerprint,
      config: layout.config,
      metrics: layout.metrics,
    },
    graph: layout.graph,
    edgeLabels,
    solution: layout.solution,
    solutionSteps,
    finalArm,
    replay: {
      hashMd5: artifact.replayHashHex,
      frames: artifact.replayFrames,
      bytes: artifact.replayBytes.length,
      validation: artifact.validation,
    },
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgPoints(points: ReadonlyArray<ISlidePoint>): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function renderGraphSvg(
  layout: ISlideLayout,
  artifact: ISlideC2mArtifact,
  edgeLabels: ReadonlyArray<ISlideEdgeLabel>,
  solutionSteps: ReadonlyArray<ISlideSolutionStep>,
  finalArm: ISlideFinalArm,
): string {
  const requiredChips = layout.graph.nodes.filter((node) => node.role === "chip").length;
  const nodesById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
  const collectionOrder = new Map(
    layout.solution.collectedChipNodeIds.map((nodeId, index) => [nodeId, index + 1]),
  );
  const baseEdges = layout.graph.edges.map((edge) => {
    const origin = nodesById.get(edge.fromNodeId);
    if (!origin) throw new Error(`I SLIDE edge "${edge.id}" has no origin node.`);
    return `    <polyline class="route route-${edge.kind}" data-edge-id="${escapeXml(edge.id)}" points="${svgPoints([origin.point, ...edge.path])}" />`;
  });
  const solutionEdges = solutionSteps.map(
    (step) =>
      `    <polyline class="solution-step" data-step="${step.sequence}" data-edge-id="${escapeXml(step.edgeId)}" points="${svgPoints(step.path)}" marker-end="url(#solution-arrow)" />`,
  );
  const finalArmEdges = solutionSteps
    .filter(
      (step) =>
        step.sequence >= finalArm.firstSolutionStep && step.sequence <= finalArm.lastSolutionStep,
    )
    .map(
      (step) =>
        `    <polyline class="final-arm-step" data-step="${step.sequence}" data-edge-id="${escapeXml(step.edgeId)}" points="${svgPoints(step.path)}" marker-end="url(#final-arm-arrow)" />`,
    );
  const renderedEdgeLabels = edgeLabels.map(
    (label) =>
      `    <text class="edge-label" data-edge-id="${escapeXml(label.edgeId)}" data-display-id="${escapeXml(label.displayId)}" x="${label.point.x}" y="${label.point.y}" dx="0.34" dy="-0.34">${escapeXml(label.displayId)}</text>`,
  );
  const nodes = layout.graph.nodes.map((node) => {
    const order = collectionOrder.get(node.id);
    const label = order === undefined ? "" : String(order);
    const accessibleLabel = order === undefined ? node.role : `${node.role}, collection ${order}`;
    return [
      `    <g class="node node-${node.role}" data-node-id="${escapeXml(node.id)}" transform="translate(${node.point.x} ${node.point.y})">`,
      `      <title>${escapeXml(`${node.id}: ${accessibleLabel}`)}</title>`,
      '      <circle r="0.7" />',
      ...(label
        ? [`      <text class="chip-order" x="0" y="0.34">${escapeXml(label)}</text>`]
        : []),
      "    </g>",
    ].join("\n");
  });
  const description =
    `Ordered route through ${requiredChips} chips, the socket, and the exit. ` +
    `Replay ${artifact.replayHashHex} validates as ${artifact.validation.engineOutcome}.`;
  const graphTitle = `${ISLIDE_C2M_METADATA.title} — 99 × 99 solution route graph`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1260" viewBox="-4 -5 107 112" role="img" aria-labelledby="graph-title graph-description">',
    `  <title id="graph-title">${escapeXml(graphTitle)}</title>`,
    `  <desc id="graph-description">${escapeXml(description)}</desc>`,
    "  <defs>",
    '    <marker id="solution-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">',
    '      <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />',
    "    </marker>",
    '    <marker id="final-arm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">',
    '      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f472b6" />',
    "    </marker>",
    "    <style>",
    "      .board { fill: #07111f; stroke: #64748b; stroke-width: 0.18; }",
    "      .route { fill: none; stroke-linecap: round; stroke-linejoin: round; }",
    "      .route-slide { stroke: #22d3ee; stroke-width: 0.22; opacity: 0.52; }",
    "      .route-walk { stroke: #94a3b8; stroke-width: 0.18; stroke-dasharray: 0.35 0.28; opacity: 0.72; }",
    "      .solution-step { fill: none; stroke: #fbbf24; stroke-width: 0.3; stroke-linecap: round; stroke-linejoin: round; opacity: 0.48; }",
    "      .final-arm-step { fill: none; stroke: #f472b6; stroke-width: 0.48; stroke-linecap: round; stroke-linejoin: round; opacity: 0.92; }",
    "      .node circle { stroke: #020617; stroke-width: 0.16; }",
    "      .node-hub circle { fill: #94a3b8; }",
    "      .node-start circle { fill: #4ade80; stroke: #dcfce7; stroke-width: 0.25; }",
    "      .node-chip circle { fill: #f8fafc; }",
    "      .node-socket circle { fill: #fb7185; stroke: #ffe4e6; stroke-width: 0.25; }",
    "      .node-exit circle { fill: #a78bfa; stroke: #ede9fe; stroke-width: 0.25; }",
    "      .chip-order { fill: #0f172a; font: 0.62px ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; text-anchor: middle; }",
    "      .heading { fill: #e2e8f0; font: 1.8px ui-sans-serif, system-ui, sans-serif; font-weight: 700; }",
    "      .metadata { fill: #94a3b8; font: 0.95px ui-monospace, SFMono-Regular, Menlo, monospace; }",
    "      .legend { fill: #cbd5e1; font: 1.05px ui-sans-serif, system-ui, sans-serif; }",
    "      .final-arm-label { fill: #f9a8d4; font: 1.05px ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }",
    "      .edge-label { fill: #f8fafc; stroke: #020617; stroke-width: 0.2px; paint-order: stroke fill; font: 0.76px ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; }",
    "    </style>",
    "  </defs>",
    '  <rect x="-4" y="-5" width="107" height="112" fill="#020617" />',
    `  <text class="heading" x="0" y="-2.4">${escapeXml(graphTitle)}</text>`,
    `  <text class="metadata" x="0" y="-0.9">fingerprint ${escapeXml(layout.fingerprint)} · replay MD5 ${artifact.replayHashHex}</text>`,
    '  <rect class="board" x="-0.5" y="-0.5" width="99" height="99" rx="0.5" />',
    '  <g id="graph-edges">',
    ...baseEdges,
    "  </g>",
    '  <g id="ordered-solution-route">',
    ...solutionEdges,
    "  </g>",
    '  <g id="unique-final-arm" data-purpose="socket-to-exit">',
    ...finalArmEdges,
    `    <text class="final-arm-label" x="${nodesById.get(finalArm.socketNodeId)!.point.x + 1.4}" y="${nodesById.get(finalArm.socketNodeId)!.point.y - 1.2}">FINAL ARM: SOCKET → EXIT</text>`,
    "  </g>",
    '  <g id="edge-labels" aria-label="Stable route edge identifiers">',
    ...renderedEdgeLabels,
    "  </g>",
    '  <g id="graph-nodes">',
    ...nodes,
    "  </g>",
    '  <g id="legend" transform="translate(0 101)">',
    '    <circle cx="0" cy="0" r="0.7" fill="#4ade80" /><text class="legend" x="1.2" y="0.35">start</text>',
    '    <circle cx="9" cy="0" r="0.7" fill="#f8fafc" /><text class="legend" x="10.2" y="0.35">chip + collection order</text>',
    '    <circle cx="31" cy="0" r="0.7" fill="#fb7185" /><text class="legend" x="32.2" y="0.35">socket</text>',
    '    <circle cx="42" cy="0" r="0.7" fill="#a78bfa" /><text class="legend" x="43.2" y="0.35">exit</text>',
    '    <line x1="52" y1="0" x2="57" y2="0" stroke="#22d3ee" stroke-width="0.3" /><text class="legend" x="58" y="0.35">ice route</text>',
    '    <line x1="67" y1="0" x2="72" y2="0" stroke="#fbbf24" stroke-width="0.4" /><text class="legend" x="73" y="0.35">solution</text>',
    '    <line x1="83" y1="0" x2="88" y2="0" stroke="#f472b6" stroke-width="0.5" /><text class="legend" x="89" y="0.35">final arm</text>',
    "  </g>",
    `  <text class="metadata" x="0" y="104">${layout.solution.edgeIds.length} transitions · ${requiredChips} chips · strict replay: ${artifact.validation.ok ? "PASS" : "FAIL"}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

export function buildDefaultISlideExportBundle(): ISlideExportBundle {
  const layout = generateISlideLayout(DEFAULT_ISLIDE_GENERATOR_CONFIG);
  const artifact = buildISlideC2mArtifact(layout);
  const edgeLabels = buildEdgeLabels(layout);
  const solutionSteps = buildSolutionSteps(layout);
  const finalArm = buildFinalArm(layout);
  const graphDocument = buildGraphDocument(layout, artifact, edgeLabels, solutionSteps, finalArm);
  return {
    layout,
    artifact,
    graphDocument,
    graphJson: `${JSON.stringify(graphDocument, null, 2)}\n`,
    graphSvg: renderGraphSvg(layout, artifact, edgeLabels, solutionSteps, finalArm),
  };
}
