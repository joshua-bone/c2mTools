import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import type {
  ISlideGeneratorConfig,
  ISlideLayout,
} from "../../procedural_generation/islide_generator.js";
import {
  buildISlideC2mArtifact,
  validateISlideC2m,
} from "../../procedural_generation/islide_replay.js";
import { BOARD_TILE_PIXEL_SIZE } from "./boardCanvasPresentation.js";
import { getSharedCc2CanvasCellCache } from "./cc2CanvasCache.js";
import { drawCc2CellsToContext, drawCc2MapToCanvas } from "./canvasMapRenderer.js";
import {
  DEFAULT_ISLIDE_SEED,
  type ISlideGenerationPort,
  type ISlideGenerationProgress,
} from "./islideGenerationPort.js";
import { createISlideGenerationWorkerPort } from "./islideGenerationWorkerPort.js";
import {
  createISlideReplayPlayback,
  type ISlideReplayPlayback,
  type ISlideReplaySnapshot,
} from "./islideReplayPlayback.js";
import { loadCc2Tileset } from "./loadCc2Tileset.js";
import { platform } from "./platform/index.js";
import "./islideStudio.css";

const TILESET_URL = `${import.meta.env.BASE_URL}cc2/spritesheet.png`;
const MAP_MIN_ZOOM = 0.125;
const MAP_MAX_ZOOM = 1;
const MAP_ZOOM_STEP = 0.125;
const GRAPH_MIN_ZOOM = 0.4;
const GRAPH_MAX_ZOOM = 2.4;
const GRAPH_ZOOM_STEP = 0.2;
const GRAPH_UNIT = 14;
const GRAPH_PADDING = 54;
const REPLAY_MAX_WORK_MS = 10;
const REPLAY_MAX_CHUNK_SUBTICKS = 2_048;

type GeneratorConfig = ISlideGeneratorConfig;
type ISlideArtifact = ReturnType<typeof buildISlideC2mArtifact>;
type ISlideValidation = ReturnType<typeof validateISlideC2m>;
type PreviewTab = "map" | "graph" | "replay";
type ReplaySpeed = 1 | 8 | "max";

type GeneratedLevel = Readonly<{
  config: GeneratorConfig;
  layout: ISlideLayout;
  revision: number;
}>;

type GenerationState =
  | Readonly<{
      kind: "running";
      requestId: number;
      revision: number;
      seed: string;
      phase: ISlideGenerationProgress["phase"];
      message: string;
      startedAt: number;
      elapsedSeconds: number;
    }>
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "error"; revision: number; seed: string; message: string }>;

type ArtifactState =
  | Readonly<{ kind: "preparing"; revision: number }>
  | Readonly<{ kind: "ready"; revision: number; artifact: ISlideArtifact }>
  | Readonly<{ kind: "error"; revision: number; message: string }>;

type ValidationState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "running" }>
  | Readonly<{ kind: "complete"; result: ISlideValidation }>
  | Readonly<{ kind: "error"; message: string }>;

type SaveState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "saving" }>
  | Readonly<{ kind: "saved"; message: string }>
  | Readonly<{ kind: "error"; message: string }>;

type GraphPoint = Readonly<{ x: number; y: number }>;

type ViewGraphNode = Readonly<{
  id: string;
  role: string;
  point: GraphPoint;
  label: string;
}>;

type ViewGraphEdge = Readonly<{
  id: string;
  displayId: string;
  points: ReadonlyArray<GraphPoint>;
  labelPoint: GraphPoint;
  kind: string;
  important: boolean;
  solution: boolean;
}>;

type ViewGraph = Readonly<{
  nodes: ReadonlyArray<ViewGraphNode>;
  edges: ReadonlyArray<ViewGraphEdge>;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatReplayTime(subticks: number): string {
  const seconds = subticks / 60;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function formatFileStem(seed: string): string {
  const normalized = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "seed";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pointFromUnknown(value: unknown): GraphPoint | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { x?: unknown; y?: unknown };
  if (typeof candidate.x !== "number" || typeof candidate.y !== "number") return null;
  return { x: candidate.x, y: candidate.y };
}

function stringFromUnknown(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function pointAlongPolyline(points: ReadonlyArray<GraphPoint>, fraction: number): GraphPoint {
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

  let remaining = totalLength * clamp(fraction, 0, 1);
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

function decorateGraphEdges(
  edges: ReadonlyArray<Pick<ViewGraphEdge, "id" | "points" | "kind">>,
  solutionEdgeIds: ReadonlySet<string>,
): ReadonlyArray<ViewGraphEdge> {
  return edges.map((edge, index) => ({
    ...edge,
    displayId: `E${String(index + 1).padStart(3, "0")}`,
    labelPoint: pointAlongPolyline(edge.points, 0.5),
    important: edge.kind === "slide" && /(?:-001|-return)$/.test(edge.id),
    solution: solutionEdgeIds.has(edge.id),
  }));
}

export function buildViewGraph(layout: ISlideLayout): ViewGraph {
  const rawGraph = layout.graph as unknown as {
    nodes?: ReadonlyArray<Record<string, unknown>>;
    edges?: ReadonlyArray<Record<string, unknown>>;
    chains?: ReadonlyArray<Record<string, unknown>>;
  };
  const rawNodes = rawGraph.nodes ?? [];
  const fallbackRadius = 40;
  let chipOrdinal = 0;
  const nodes = rawNodes.map((node, index): ViewGraphNode => {
    const angle = (index / Math.max(1, rawNodes.length)) * Math.PI * 2 - Math.PI / 2;
    const point =
      pointFromUnknown(node.point) ??
      (typeof node.x === "number" && typeof node.y === "number"
        ? { x: node.x, y: node.y }
        : {
            x: 49 + Math.cos(angle) * fallbackRadius,
            y: 49 + Math.sin(angle) * fallbackRadius,
          });
    const role = stringFromUnknown(node.role, "route");
    const id = stringFromUnknown(node.id, `node-${index + 1}`);
    if (role === "chip") chipOrdinal += 1;
    return {
      id,
      role,
      point,
      label: stringFromUnknown(node.label, role === "chip" ? `Chip ${chipOrdinal}` : role),
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: Array<Pick<ViewGraphEdge, "id" | "points" | "kind">> = [];

  for (const [index, edge] of (rawGraph.edges ?? []).entries()) {
    const fromId = stringFromUnknown(edge.fromNodeId ?? edge.from, "");
    const toId = stringFromUnknown(edge.toNodeId ?? edge.to, "");
    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);
    if (!from || !to) continue;
    const path = Array.isArray(edge.path)
      ? edge.path.map(pointFromUnknown).filter((point): point is GraphPoint => point !== null)
      : [];
    edges.push({
      id: stringFromUnknown(edge.id, `edge-${index + 1}`),
      points: [from.point, ...path, to.point],
      kind: stringFromUnknown(edge.kind, "route"),
    });
  }

  if (edges.length === 0) {
    for (const [chainIndex, chain] of (rawGraph.chains ?? []).entries()) {
      const rawNodeIds = Array.isArray(chain.nodeIds)
        ? chain.nodeIds
        : Array.isArray(chain.nodes)
          ? chain.nodes
          : [];
      const nodeIds = rawNodeIds.filter((id): id is string => typeof id === "string");
      for (let index = 1; index < nodeIds.length; index += 1) {
        const from = nodeById.get(nodeIds[index - 1]!);
        const to = nodeById.get(nodeIds[index]!);
        if (!from || !to) continue;
        edges.push({
          id: `chain-${chainIndex + 1}-${index}`,
          points: [from.point, to.point],
          kind: stringFromUnknown(chain.kind, "route"),
        });
      }
    }
  }

  return { nodes, edges: decorateGraphEdges(edges, new Set(layout.solution.edgeIds)) };
}

function graphCoordinate(value: number): number {
  return GRAPH_PADDING + value * GRAPH_UNIT;
}

function graphRoleClass(role: string): string {
  return role.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function graphNodeLabel(node: ViewGraphNode, chipNumber: number): string | null {
  switch (node.role) {
    case "start":
      return "START";
    case "socket":
      return "SOCKET";
    case "exit":
      return "EXIT";
    case "chip":
      return chipNumber % 10 === 0 ? String(chipNumber) : null;
    default:
      return null;
  }
}

export type ISlideStudioAppProps = Readonly<{
  generationPort?: ISlideGenerationPort;
}>;

export default function ISlideStudioApp({
  generationPort: providedGenerationPort,
}: ISlideStudioAppProps = {}) {
  const [generationPort] = useState(
    () => providedGenerationPort ?? createISlideGenerationWorkerPort(),
  );
  const ownsGenerationPort = useRef(providedGenerationPort === undefined);
  const [draftSeed, setDraftSeed] = useState(DEFAULT_ISLIDE_SEED);
  const [generated, setGenerated] = useState<GeneratedLevel | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>({
    kind: "running",
    requestId: 0,
    revision: 1,
    seed: DEFAULT_ISLIDE_SEED,
    phase: "starting",
    message: "Starting generation worker",
    startedAt: Date.now(),
    elapsedSeconds: 0,
  });
  const [artifactState, setArtifactState] = useState<ArtifactState>({
    kind: "preparing",
    revision: 0,
  });
  const [activeTab, setActiveTab] = useState<PreviewTab>("map");
  const [mapZoom, setMapZoom] = useState(0.25);
  const [graphZoom, setGraphZoom] = useState(0.8);
  const [replayZoom, setReplayZoom] = useState(0.25);
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [validation, setValidation] = useState<ValidationState>({ kind: "idle" });
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const artifactRequestRef = useRef(0);
  const validationRequestRef = useRef(0);
  const generationRequestRef = useRef(0);
  const generationAbortRef = useRef<AbortController | null>(null);

  const isGenerating = generationState.kind === "running";
  const draftIsPending = generated === null || draftSeed !== generated.config.seed;
  const viewGraph = useMemo(
    () => (generated ? buildViewGraph(generated.layout) : null),
    [generated],
  );
  const actualChipCount = useMemo(
    () => viewGraph?.nodes.filter((node) => node.role === "chip").length ?? 0,
    [viewGraph],
  );

  const requestGeneration = useCallback(
    async (seed: string, revision: number): Promise<void> => {
      const requestId = generationRequestRef.current + 1;
      generationRequestRef.current = requestId;
      generationAbortRef.current?.abort();
      const abortController = new AbortController();
      generationAbortRef.current = abortController;
      validationRequestRef.current += 1;
      setGenerationState({
        kind: "running",
        requestId,
        revision,
        seed,
        phase: "starting",
        message: "Starting generation worker",
        startedAt: Date.now(),
        elapsedSeconds: 0,
      });

      try {
        const layout = await generationPort.generate(seed, {
          signal: abortController.signal,
          onProgress: (progress) => {
            if (generationRequestRef.current !== requestId) return;
            setGenerationState((current) =>
              current.kind === "running" && current.requestId === requestId
                ? { ...current, phase: progress.phase, message: progress.message }
                : current,
            );
          },
        });
        if (abortController.signal.aborted || generationRequestRef.current !== requestId) return;

        const next: GeneratedLevel = { config: layout.config, layout, revision };
        const nextGraph = buildViewGraph(layout);
        artifactRequestRef.current += 1;
        setGenerated(next);
        setSelectedEdgeId(
          nextGraph.edges.find((edge) => edge.important)?.id ?? nextGraph.edges[0]?.id ?? "",
        );
        setArtifactState({ kind: "preparing", revision });
        setGenerationState({ kind: "idle" });
        setSaveState({ kind: "idle" });
        setValidation((current) => (current.kind === "idle" ? current : { kind: "stale" }));
        setActiveTab((current) => (current === "replay" ? "map" : current));
      } catch (error) {
        if (
          abortController.signal.aborted ||
          generationRequestRef.current !== requestId ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setGenerationState({ kind: "error", revision, seed, message: errorMessage(error) });
      }
    },
    [generationPort],
  );

  useEffect(() => {
    void requestGeneration(DEFAULT_ISLIDE_SEED, 1);
  }, [requestGeneration]);

  useEffect(() => {
    return () => {
      generationRequestRef.current += 1;
      generationAbortRef.current?.abort();
      if (ownsGenerationPort.current) generationPort.dispose();
    };
  }, [generationPort]);

  useEffect(() => {
    if (generationState.kind !== "running") return;
    const requestId = generationState.requestId;
    const startedAt = generationState.startedAt;
    const intervalId = window.setInterval(() => {
      setGenerationState((current) =>
        current.kind === "running" && current.requestId === requestId
          ? { ...current, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1_000) }
          : current,
      );
    }, 1_000);
    return () => window.clearInterval(intervalId);
  }, [generationState]);

  useEffect(() => {
    if (!generated) return;
    const requestId = artifactRequestRef.current + 1;
    artifactRequestRef.current = requestId;
    const revision = generated.revision;
    let cancelled = false;

    setArtifactState({ kind: "preparing", revision });
    const timeoutId = window.setTimeout(() => {
      if (cancelled || artifactRequestRef.current !== requestId) return;
      try {
        const artifact = buildISlideC2mArtifact(generated.layout);
        if (cancelled || artifactRequestRef.current !== requestId) return;
        setArtifactState({ kind: "ready", revision, artifact });
      } catch (error: unknown) {
        if (cancelled || artifactRequestRef.current !== requestId) return;
        setArtifactState({ kind: "error", revision, message: errorMessage(error) });
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [generated]);

  function handleGenerate(): void {
    if (isGenerating) return;
    void requestGeneration(draftSeed, (generated?.revision ?? 0) + 1);
  }

  async function handleValidate(): Promise<void> {
    if (
      isGenerating ||
      !generated ||
      artifactState.kind !== "ready" ||
      artifactState.revision !== generated.revision
    )
      return;

    const requestId = validationRequestRef.current + 1;
    validationRequestRef.current = requestId;
    const revision = generated.revision;
    const artifact = artifactState.artifact;
    setValidation({ kind: "running" });

    try {
      const result = await Promise.resolve().then(() =>
        validateISlideC2m(artifact.c2mBytes, {
          expectedReplayHashHex: artifact.replayHashHex,
          policy: "generated-strict",
        }),
      );
      if (validationRequestRef.current !== requestId || generated.revision !== revision) {
        return;
      }
      setValidation({ kind: "complete", result });
    } catch (error) {
      if (validationRequestRef.current !== requestId) return;
      setValidation({ kind: "error", message: errorMessage(error) });
    }
  }

  async function handleDownload(): Promise<void> {
    if (
      isGenerating ||
      !generated ||
      artifactState.kind !== "ready" ||
      artifactState.revision !== generated.revision
    )
      return;

    const fileName = `i-slide-99x99-${formatFileStem(generated.config.seed)}-${generated.layout.fingerprint.slice(0, 8)}.c2m`;
    const artifact = artifactState.artifact;
    setSaveState({ kind: "saving" });
    try {
      await platform.saveC2mFile(fileName, artifact.c2mBytes);
      setSaveState({ kind: "saved", message: `Saved ${fileName}` });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setSaveState({ kind: "idle" });
        return;
      }
      setSaveState({ kind: "error", message: errorMessage(error) });
    }
  }

  function selectTab(tab: PreviewTab): void {
    setActiveTab(tab);
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const tabs: ReadonlyArray<PreviewTab> = ["map", "graph", "replay"];
    const activeIndex = tabs.indexOf(activeTab);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (activeIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex]!;
    setActiveTab(nextTab);
    document.getElementById(`islide-${nextTab}-tab`)?.focus();
  }

  const artifactReady =
    !isGenerating &&
    generated !== null &&
    artifactState.kind === "ready" &&
    artifactState.revision === generated.revision;
  const artifactCopy = generated
    ? getArtifactCopy(artifactState, generated.revision)
    : {
        tone: "working" as const,
        glyph: "◇",
        title: "Waiting for generated level",
        detail: "C2M and replay preparation begins when the map and graph are ready.",
      };
  const validationCopy = getValidationCopy(validation);
  const saveCopy = getSaveCopy(saveState);

  return (
    <div className="islideStudio">
      <aside className="islideSidebar" aria-label="I SLIDE generator">
        <header className="islideBrand">
          <div className="islideBrandMark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="islideKicker">CC2 constellation lab</p>
            <h1>I SLIDE</h1>
            <p className="islideSubtitle">99 × 99 deterministic generator</p>
          </div>
        </header>

        <div className="islideSidebarScroll">
          <section className="islideControlSection" aria-labelledby="islide-seed-title">
            <div className="islideSectionHeading">
              <div>
                <span className="islideSectionNumber">01</span>
                <h2 id="islide-seed-title">Constellation</h2>
              </div>
              <span className={`islideDraftFlag${draftIsPending ? " is-pending" : ""}`}>
                {draftIsPending ? "Changes pending" : "Applied"}
              </span>
            </div>
            <label className="islideSeedField">
              <span>Seed</span>
              <input
                value={draftSeed}
                onChange={(event) => setDraftSeed(event.target.value)}
                spellCheck={false}
              />
            </label>
            <p className="islideFieldNote">
              The same seed always produces the same map, graph, and engine replay.
            </p>
            {generationState.kind === "running" ? (
              <GenerationProgress state={generationState} compact />
            ) : null}
          </section>

          <section
            className="islideControlSection islideMetrics"
            aria-labelledby="islide-level-title"
          >
            <div className="islideSectionHeading">
              <div>
                <span className="islideSectionNumber">02</span>
                <h2 id="islide-level-title">Generated level</h2>
              </div>
              <span className="islideRevision">#{generated?.revision ?? "—"}</span>
            </div>
            <dl className="islideMetricGrid">
              <Metric label="Chips" value={generated ? String(actualChipCount) : "—"} />
              <Metric
                label="Routes"
                value={generated ? String(generated.layout.graph.chains.length) : "—"}
              />
              <Metric
                label="Sparkles"
                value={generated ? String(generated.layout.metrics.completeCornerGroups) : "—"}
              />
              <Metric
                label="Crossings"
                value={generated ? String(generated.layout.metrics.routeCrossings) : "—"}
              />
            </dl>
            <div className="islideArtifactMeta">
              <span>Fingerprint</span>
              <code>{generated?.layout.fingerprint ?? "Pending"}</code>
              <span>C2M / replay</span>
              <strong>
                {!generated || isGenerating
                  ? "Waiting for level…"
                  : artifactReady
                    ? `${formatBytes(artifactState.artifact.c2mBytes.length)} / ${artifactState.artifact.replayBytes.length} bytes`
                    : artifactState.kind === "error"
                      ? "Unavailable"
                      : "Preparing…"}
              </strong>
            </div>
          </section>
        </div>

        <footer className="islideActions">
          {generationState.kind === "error" ? (
            <p className="islideActionMessage is-error" role="alert">
              {generationState.message}
            </p>
          ) : null}
          <button
            className="islideGenerateButton"
            type="button"
            disabled={isGenerating}
            onClick={handleGenerate}
          >
            <span>{isGenerating ? "Generating level…" : "Generate level"}</span>
            <span aria-hidden="true">✦</span>
          </button>
          <div className="islideSecondaryActions">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={!artifactReady || saveState.kind === "saving"}
            >
              {isGenerating || !generated
                ? "Download C2M"
                : artifactState.kind === "preparing"
                  ? "Preparing C2M…"
                  : saveState.kind === "saving"
                    ? "Saving…"
                    : "Download C2M"}
            </button>
            <button
              className="islideValidateButton"
              type="button"
              onClick={() => void handleValidate()}
              disabled={!artifactReady || validation.kind === "running"}
            >
              {isGenerating || !generated
                ? "Validate replay"
                : artifactState.kind === "preparing"
                  ? "Preparing replay…"
                  : validation.kind === "running"
                    ? "Validating…"
                    : "Validate replay"}
            </button>
            <button
              className="islideViewReplayButton"
              type="button"
              onClick={() => setActiveTab("replay")}
              disabled={!artifactReady}
            >
              View replay
            </button>
          </div>
          <div
            className={`islideArtifactStatus is-${artifactCopy.tone}`}
            role={artifactCopy.tone === "error" ? "alert" : "status"}
          >
            <span className="islideArtifactGlyph" aria-hidden="true">
              {artifactCopy.glyph}
            </span>
            <div>
              <strong>{artifactCopy.title}</strong>
              <span>{artifactCopy.detail}</span>
            </div>
          </div>
          <div className={`islideValidationStatus is-${validationCopy.tone}`} role="status">
            <span className="islideStatusLight" aria-hidden="true" />
            <div>
              <strong>{validationCopy.title}</strong>
              <span>{validationCopy.detail}</span>
            </div>
          </div>
          {saveCopy ? (
            <p className={`islideSaveStatus is-${saveCopy.tone}`}>{saveCopy.text}</p>
          ) : null}
        </footer>
      </aside>

      <main className="islideWorkspace">
        <header className="islideWorkspaceHeader">
          <div className="islideTabs" role="tablist" aria-label="Level previews">
            <button
              id="islide-map-tab"
              type="button"
              role="tab"
              aria-controls="islide-map-panel"
              aria-selected={activeTab === "map"}
              tabIndex={activeTab === "map" ? 0 : -1}
              disabled={!generated || isGenerating}
              onClick={() => selectTab("map")}
              onKeyDown={handleTabKeyDown}
            >
              Map
              <span>{generated ? "99 × 99" : "Pending"}</span>
            </button>
            <button
              id="islide-graph-tab"
              type="button"
              role="tab"
              aria-controls="islide-graph-panel"
              aria-selected={activeTab === "graph"}
              tabIndex={activeTab === "graph" ? 0 : -1}
              disabled={!generated || isGenerating}
              onClick={() => selectTab("graph")}
              onKeyDown={handleTabKeyDown}
            >
              Level graph
              <span>{generated ? `${generated.layout.graph.nodes.length} nodes` : "Pending"}</span>
            </button>
            <button
              id="islide-replay-tab"
              type="button"
              role="tab"
              aria-controls="islide-replay-panel"
              aria-selected={activeTab === "replay"}
              tabIndex={activeTab === "replay" ? 0 : -1}
              disabled={!artifactReady}
              onClick={() => selectTab("replay")}
              onKeyDown={handleTabKeyDown}
            >
              Replay
              <span>
                {artifactReady
                  ? `${artifactState.artifact.replayFrames} subticks`
                  : generated
                    ? "Preparing"
                    : "Pending"}
              </span>
            </button>
          </div>
          {viewGraph ? (
            <RouteEdgeInspector
              graph={viewGraph}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={setSelectedEdgeId}
              disabled={isGenerating}
            />
          ) : (
            <div className="islideEdgeInspector is-pending" aria-hidden="true">
              Route edges available after generation
            </div>
          )}
          <div className="islideWorkspaceSummary" aria-label="Applied generation summary">
            <span>
              {generated?.config.seed ??
                (generationState.kind === "running" ? generationState.seed : draftSeed)}
            </span>
            <strong>{generated ? `${actualChipCount} chips` : "Generating"}</strong>
          </div>
        </header>

        {generated && viewGraph ? (
          <>
            <MapPreview
              key={`map-${generated.revision}`}
              layout={generated.layout}
              graph={viewGraph}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={setSelectedEdgeId}
              zoom={mapZoom}
              onZoomChange={setMapZoom}
              active={activeTab === "map"}
            />
            <GraphPreview
              key={`graph-${generated.revision}`}
              graph={viewGraph}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={setSelectedEdgeId}
              zoom={graphZoom}
              onZoomChange={setGraphZoom}
              active={activeTab === "graph"}
            />
            <ReplayPreview
              key={`replay-${generated.revision}`}
              artifactState={artifactState}
              revision={generated.revision}
              zoom={replayZoom}
              onZoomChange={setReplayZoom}
              active={activeTab === "replay"}
            />
          </>
        ) : (
          <GenerationWorkspace state={generationState} />
        )}
        {generated && generationState.kind === "running" ? (
          <div className="islideGenerationOverlay">
            <GenerationProgress state={generationState} />
            <p>The current preview stays visible until the replacement is complete.</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function GenerationProgress({
  state,
  compact = false,
}: Readonly<{
  state: Extract<GenerationState, { kind: "running" }>;
  compact?: boolean;
}>) {
  return (
    <div
      className={`islideGenerationProgress${compact ? " is-compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div>
        <strong>{state.message}</strong>
        <span>{state.elapsedSeconds}s elapsed</span>
      </div>
      <progress aria-label="Level generation progress" />
    </div>
  );
}

function GenerationWorkspace({ state }: Readonly<{ state: GenerationState }>) {
  if (state.kind === "error") {
    return (
      <section className="islideGenerationWorkspace is-error" role="alert">
        <span className="islideGenerationSpark" aria-hidden="true">
          !
        </span>
        <p>Generation paused</p>
        <h2>The first map could not be built</h2>
        <span>{state.message}</span>
        <small>Adjust the seed or press Generate level to retry.</small>
      </section>
    );
  }

  if (state.kind === "running") {
    return (
      <section className="islideGenerationWorkspace" aria-busy="true">
        <span className="islideGenerationSpark" aria-hidden="true">
          ✦
        </span>
        <p>Seed {state.seed}</p>
        <h2>Preparing the first map</h2>
        <span>The shell is ready while the generator works off-thread.</span>
        <GenerationProgress state={state} />
      </section>
    );
  }

  return null;
}

function RouteEdgeInspector({
  graph,
  selectedEdgeId,
  onSelectEdge,
  disabled,
}: Readonly<{
  graph: ViewGraph;
  selectedEdgeId: string;
  onSelectEdge: (edgeId: string) => void;
  disabled: boolean;
}>) {
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId) ?? graph.edges[0];
  return (
    <label className="islideEdgeInspector">
      <span>Route edge</span>
      <select
        aria-label="Inspect route edge"
        value={selectedEdge?.id ?? ""}
        disabled={disabled}
        onChange={(event) => onSelectEdge(event.target.value)}
      >
        {graph.edges.map((edge) => (
          <option key={edge.id} value={edge.id}>
            {edge.displayId} — {edge.id}
          </option>
        ))}
      </select>
      {selectedEdge ? (
        <span className="islideEdgeSelection" title={selectedEdge.id}>
          <strong>{selectedEdge.displayId}</strong>
          <span>{selectedEdge.id}</span>
        </span>
      ) : null}
    </label>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MapPreview({
  layout,
  graph,
  selectedEdgeId,
  onSelectEdge,
  zoom,
  onZoomChange,
  active,
}: Readonly<{
  layout: ISlideLayout;
  graph: ViewGraph;
  selectedEdgeId: string;
  onSelectEdge: (edgeId: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  active: boolean;
}>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tilesetState, setTilesetState] = useState<
    | Readonly<{ kind: "loading" }>
    | Readonly<{ kind: "ready" }>
    | Readonly<{ kind: "error"; message: string }>
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadCc2Tileset(TILESET_URL)
      .then((tileset) => {
        if (cancelled || !canvasRef.current) return;
        drawCc2MapToCanvas(canvasRef.current, layout.map, getSharedCc2CanvasCellCache(tileset));
        setTilesetState({ kind: "ready" });
      })
      .catch((error) => {
        if (cancelled) return;
        setTilesetState({ kind: "error", message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [layout.map]);

  const boardWidth = layout.map.width * BOARD_TILE_PIXEL_SIZE;
  const boardHeight = layout.map.height * BOARD_TILE_PIXEL_SIZE;
  const scaledWidth = boardWidth * zoom;
  const scaledHeight = boardHeight * zoom;

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? MAP_ZOOM_STEP : -MAP_ZOOM_STEP;
    onZoomChange(clamp(zoom + direction, MAP_MIN_ZOOM, MAP_MAX_ZOOM));
  }

  return (
    <section
      id="islide-map-panel"
      className="islidePreviewPanel"
      role="tabpanel"
      aria-labelledby="islide-map-tab"
      hidden={!active}
    >
      <PreviewToolbar
        eyebrow="C2M terrain"
        title="Map preview"
        detail={`${layout.map.width} × ${layout.map.height} / ${formatPercent(zoom)}`}
        zoom={zoom}
        minZoom={MAP_MIN_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        step={MAP_ZOOM_STEP}
        resetZoom={0.25}
        onZoomChange={onZoomChange}
      />
      <div
        className="islidePreviewScroller is-map"
        onWheel={handleWheel}
        aria-label="Scrollable C2M map viewport"
      >
        <div
          className="islideMapWorld"
          style={{ width: scaledWidth + 72, height: scaledHeight + 72 }}
        >
          <div className="islideMapFrame" style={{ width: scaledWidth, height: scaledHeight }}>
            <canvas
              ref={canvasRef}
              aria-label="99 by 99 C2M map preview"
              role="img"
              width={boardWidth}
              height={boardHeight}
              style={{ width: scaledWidth, height: scaledHeight }}
            />
            <MapRouteOverlay
              graph={graph}
              selectedEdgeId={selectedEdgeId}
              onSelectEdge={onSelectEdge}
              width={boardWidth}
              height={boardHeight}
              zoom={zoom}
            />
            {tilesetState.kind !== "ready" ? (
              <div className={`islideCanvasState is-${tilesetState.kind}`}>
                {tilesetState.kind === "loading" ? "Loading CC2 tiles…" : tilesetState.message}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <p className="islideInteractionHint">
        Scroll to travel the field. Hold Ctrl or ⌘ while scrolling to zoom.
      </p>
    </section>
  );
}

function MapRouteOverlay({
  graph,
  selectedEdgeId,
  onSelectEdge,
  width,
  height,
  zoom,
}: Readonly<{
  graph: ViewGraph;
  selectedEdgeId: string;
  onSelectEdge: (edgeId: string) => void;
  width: number;
  height: number;
  zoom: number;
}>) {
  return (
    <svg
      className="islideMapRoutes"
      aria-label="Selectable route edges over the C2M map"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <g className="islideRouteLines">
        {graph.edges.map((edge) => {
          const points = edge.points
            .map(
              (point) =>
                `${(point.x + 0.5) * BOARD_TILE_PIXEL_SIZE},${(point.y + 0.5) * BOARD_TILE_PIXEL_SIZE}`,
            )
            .join(" ");
          const selected = edge.id === selectedEdgeId;
          const className = `islideRouteEdge is-${graphRoleClass(edge.kind)}${edge.solution ? " is-solution" : ""}${selected ? " is-selected" : ""}`;
          return (
            <g key={edge.id}>
              <polyline className={className} points={points} vectorEffect="non-scaling-stroke" />
              <polyline
                className="islideRouteEdgeHit"
                points={points}
                vectorEffect="non-scaling-stroke"
                role="button"
                tabIndex={0}
                aria-label={`${edge.displayId}: ${edge.id}`}
                aria-pressed={selected}
                onClick={() => onSelectEdge(edge.id)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectEdge(edge.id);
                }}
              >
                <title>{`${edge.displayId} — ${edge.id}`}</title>
              </polyline>
            </g>
          );
        })}
      </g>
      <g className="islideRouteLabels" aria-hidden="true">
        {graph.edges.map((edge) => (
          <text
            key={edge.id}
            className={`${edge.important ? "is-important" : ""}${edge.id === selectedEdgeId ? " is-selected" : ""}`}
            x={(edge.labelPoint.x + 0.5) * BOARD_TILE_PIXEL_SIZE}
            y={(edge.labelPoint.y + 0.5) * BOARD_TILE_PIXEL_SIZE}
            style={{ fontSize: Math.max(9, 7 / zoom) }}
          >
            {edge.displayId}
          </text>
        ))}
      </g>
    </svg>
  );
}

function GraphPreview({
  graph,
  selectedEdgeId,
  onSelectEdge,
  zoom,
  onZoomChange,
  active,
}: Readonly<{
  graph: ViewGraph;
  selectedEdgeId: string;
  onSelectEdge: (edgeId: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  active: boolean;
}>) {
  const graphSize = GRAPH_PADDING * 2 + 99 * GRAPH_UNIT;
  const scaledSize = graphSize * zoom;
  let chipNumber = 0;

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? GRAPH_ZOOM_STEP : -GRAPH_ZOOM_STEP;
    onZoomChange(clamp(zoom + direction, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM));
  }

  return (
    <section
      id="islide-graph-panel"
      className="islidePreviewPanel"
      role="tabpanel"
      aria-labelledby="islide-graph-tab"
      hidden={!active}
    >
      <PreviewToolbar
        eyebrow="Extracted routes"
        title="Level graph"
        detail={`${graph.nodes.length} nodes / ${graph.edges.length} connections / ${formatPercent(zoom)}`}
        zoom={zoom}
        minZoom={GRAPH_MIN_ZOOM}
        maxZoom={GRAPH_MAX_ZOOM}
        step={GRAPH_ZOOM_STEP}
        resetZoom={0.8}
        onZoomChange={onZoomChange}
      />
      <div
        className="islidePreviewScroller is-graph"
        onWheel={handleWheel}
        aria-label="Scrollable level graph viewport"
      >
        <div
          className="islideGraphWorld"
          style={{ width: scaledSize + 72, height: scaledSize + 72 }}
        >
          <svg
            className="islideGraph"
            aria-label="Level route graph"
            role="img"
            viewBox={`0 0 ${graphSize} ${graphSize}`}
            width={scaledSize}
            height={scaledSize}
          >
            <defs>
              <pattern
                id="islide-graph-grid"
                width={GRAPH_UNIT * 5}
                height={GRAPH_UNIT * 5}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${GRAPH_UNIT * 5} 0 L 0 0 0 ${GRAPH_UNIT * 5}`}
                  className="islideGraphGridLine"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" className="islideGraphBackdrop" />
            <rect width="100%" height="100%" fill="url(#islide-graph-grid)" />
            <g className="islideGraphEdges">
              {graph.edges.map((edge) => {
                const selected = edge.id === selectedEdgeId;
                const points = edge.points
                  .map((point) => `${graphCoordinate(point.x)},${graphCoordinate(point.y)}`)
                  .join(" ");
                return (
                  <g key={edge.id}>
                    <polyline
                      className={`islideGraphEdge is-${graphRoleClass(edge.kind)}${edge.solution ? " is-solution" : ""}${selected ? " is-selected" : ""}`}
                      points={points}
                      vectorEffect="non-scaling-stroke"
                    />
                    <polyline
                      className="islideGraphEdgeHit"
                      points={points}
                      vectorEffect="non-scaling-stroke"
                      role="button"
                      tabIndex={0}
                      aria-label={`${edge.displayId}: ${edge.id}`}
                      aria-pressed={selected}
                      onClick={() => onSelectEdge(edge.id)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onSelectEdge(edge.id);
                      }}
                    >
                      <title>{`${edge.displayId} — ${edge.id}`}</title>
                    </polyline>
                  </g>
                );
              })}
            </g>
            <g className="islideGraphEdgeLabels" aria-hidden="true">
              {graph.edges.map((edge) => (
                <text
                  key={edge.id}
                  className={`${edge.important ? "is-important" : ""}${edge.id === selectedEdgeId ? " is-selected" : ""}`}
                  x={graphCoordinate(edge.labelPoint.x)}
                  y={graphCoordinate(edge.labelPoint.y)}
                  style={{ fontSize: Math.max(7, 8 / zoom) }}
                >
                  {edge.displayId}
                </text>
              ))}
            </g>
            <g className="islideGraphNodes">
              {graph.nodes.map((node) => {
                if (node.role === "chip") chipNumber += 1;
                const label = graphNodeLabel(node, chipNumber);
                const radius = node.role === "chip" ? 5 : node.role === "route" ? 5 : 8;
                return (
                  <g
                    key={node.id}
                    className={`islideGraphNode is-${graphRoleClass(node.role)}`}
                    transform={`translate(${graphCoordinate(node.point.x)} ${graphCoordinate(node.point.y)})`}
                  >
                    <title>{`${node.label} (${Math.round(node.point.x)}, ${Math.round(node.point.y)})`}</title>
                    <circle r={radius} />
                    {label ? (
                      <text x={radius + 5} y="4">
                        {label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>
      <div className="islideGraphLegend" aria-label="Graph legend">
        <span className="is-start">Start</span>
        <span className="is-chip">Chip</span>
        <span className="is-socket">Socket</span>
        <span className="is-exit">Exit</span>
      </div>
    </section>
  );
}

function ReplayPreview({
  artifactState,
  revision,
  zoom,
  onZoomChange,
  active,
}: Readonly<{
  artifactState: ArtifactState;
  revision: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  active: boolean;
}>) {
  const playbackRef = useRef<ISlideReplayPlayback | null>(null);
  const [snapshot, setSnapshot] = useState<ISlideReplaySnapshot | null>(null);
  const snapshotRef = useRef<ISlideReplaySnapshot | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);

  useEffect(() => {
    setPlaying(false);
    playbackRef.current = null;
    snapshotRef.current = null;
    setSnapshot(null);
    setViewerError(null);

    if (artifactState.revision !== revision || artifactState.kind === "preparing") {
      setPreparing(true);
      return;
    }
    if (artifactState.kind === "error") {
      setPreparing(false);
      setViewerError(artifactState.message);
      return;
    }

    let cancelled = false;
    setPreparing(true);
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const playback = createISlideReplayPlayback(
          artifactState.artifact.c2mBytes,
          artifactState.artifact.replayFrames,
        );
        if (cancelled) return;
        playbackRef.current = playback;
        snapshotRef.current = playback.snapshot();
        setSnapshot(snapshotRef.current);
        setPreparing(false);
      } catch (error) {
        if (cancelled) return;
        setPreparing(false);
        setViewerError(errorMessage(error));
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [artifactState, revision]);

  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);

  useEffect(() => {
    if (!playing || !active || !playbackRef.current || snapshotRef.current?.outcome !== "playing") {
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let previousTime = performance.now();
    let subtickRemainder = 0;

    const animate = (now: number) => {
      if (disposed) return;
      const playback = playbackRef.current;
      if (!playback) return;
      let nextSnapshot = playback.snapshot();

      if (speed === "max") {
        const deadline = performance.now() + REPLAY_MAX_WORK_MS;
        do {
          nextSnapshot = playback.advance(REPLAY_MAX_CHUNK_SUBTICKS);
        } while (nextSnapshot.outcome === "playing" && performance.now() < deadline);
      } else {
        const elapsedMs = Math.min(250, Math.max(0, now - previousTime));
        subtickRemainder += (elapsedMs * 60 * speed) / 1_000;
        const subticks = Math.floor(subtickRemainder);
        subtickRemainder -= subticks;
        if (subticks > 0) nextSnapshot = playback.advance(subticks);
      }
      previousTime = now;

      if (nextSnapshot !== snapshotRef.current) {
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
      }
      if (nextSnapshot.outcome !== "playing") {
        setPlaying(false);
        return;
      }
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [active, playing, speed]);

  function handleRestart(): void {
    const playback = playbackRef.current;
    if (!playback) return;
    setPlaying(false);
    snapshotRef.current = playback.reset();
    setSnapshot(snapshotRef.current);
  }

  function selectSpeed(nextSpeed: ReplaySpeed): void {
    setSpeed(nextSpeed);
    if (nextSpeed === "max" && snapshot?.outcome === "playing") setPlaying(true);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? MAP_ZOOM_STEP : -MAP_ZOOM_STEP;
    onZoomChange(clamp(zoom + direction, MAP_MIN_ZOOM, MAP_MAX_ZOOM));
  }

  const boardWidth = (snapshot?.map.width ?? 99) * BOARD_TILE_PIXEL_SIZE;
  const boardHeight = (snapshot?.map.height ?? 99) * BOARD_TILE_PIXEL_SIZE;
  const scaledWidth = boardWidth * zoom;
  const scaledHeight = boardHeight * zoom;
  const replayStateCopy = viewerError
    ? viewerError
    : preparing
      ? "Preparing exact NotCC replay…"
      : snapshot
        ? `${snapshot.outcome} / ${snapshot.chipsLeft} chips left`
        : "Replay unavailable";

  return (
    <section
      id="islide-replay-panel"
      className="islidePreviewPanel is-replay"
      role="tabpanel"
      aria-labelledby="islide-replay-tab"
      hidden={!active}
    >
      <PreviewToolbar
        eyebrow="@notcc/logic engine state"
        title="Replay viewer"
        detail={
          snapshot
            ? `${snapshot.elapsedSubticks} / ${snapshot.totalSubticks} subticks / ${formatPercent(zoom)}`
            : `Exact generated replay / ${formatPercent(zoom)}`
        }
        zoom={zoom}
        minZoom={MAP_MIN_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        step={MAP_ZOOM_STEP}
        resetZoom={0.25}
        onZoomChange={onZoomChange}
      />
      <div className="islideReplayControls" aria-label="Replay controls">
        <button
          type="button"
          className="islideReplayPlay"
          disabled={!snapshot || (snapshot.outcome !== "playing" && !playing)}
          onClick={() => setPlaying((current) => !current)}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" disabled={!snapshot} onClick={handleRestart}>
          Restart
        </button>
        <div className="islideReplaySpeeds" role="group" aria-label="Replay speed">
          {([1, 8, "max"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={speed === option ? "is-active" : undefined}
              aria-pressed={speed === option}
              aria-label={option === "max" ? "Max-speed fast-forward" : `${option} times speed`}
              disabled={!snapshot}
              onClick={() => selectSpeed(option)}
            >
              {option === "max" ? "MAX" : `${option}×`}
            </button>
          ))}
        </div>
        <div className="islideReplayReadout" role="status" aria-live="polite">
          <strong>{replayStateCopy}</strong>
          {snapshot ? (
            <span>
              {formatReplayTime(snapshot.elapsedSubticks)} / tick {snapshot.engineTick}.
              {snapshot.engineSubtick}
            </span>
          ) : null}
        </div>
        <progress
          aria-label="Replay progress"
          max={snapshot?.totalSubticks ?? 1}
          value={snapshot?.elapsedSubticks ?? 0}
        />
      </div>
      <div
        className="islidePreviewScroller is-map is-replay"
        onWheel={handleWheel}
        aria-label="Scrollable engine replay viewport"
      >
        <div
          className="islideMapWorld"
          style={{ width: scaledWidth + 72, height: scaledHeight + 72 }}
        >
          <div className="islideMapFrame" style={{ width: scaledWidth, height: scaledHeight }}>
            {snapshot ? (
              <ReplayCanvas
                snapshot={snapshot}
                boardWidth={boardWidth}
                boardHeight={boardHeight}
                scaledWidth={scaledWidth}
                scaledHeight={scaledHeight}
              />
            ) : (
              <div className={`islideCanvasState is-${viewerError ? "error" : "loading"}`}>
                {replayStateCopy}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="islideInteractionHint">
        Every frame is advanced by NotCC from the packaged replay; route lines are never used as
        animation input.
      </p>
    </section>
  );
}

function ReplayCanvas({
  snapshot,
  boardWidth,
  boardHeight,
  scaledWidth,
  scaledHeight,
}: Readonly<{
  snapshot: ISlideReplaySnapshot;
  boardWidth: number;
  boardHeight: number;
  scaledWidth: number;
  scaledHeight: number;
}>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawnRef = useRef(false);
  const [cellCache, setCellCache] = useState<
    ReturnType<typeof getSharedCc2CanvasCellCache> | undefined
  >();
  const [tilesetError, setTilesetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCc2Tileset(TILESET_URL)
      .then((tileset) => {
        if (cancelled) return;
        setCellCache(getSharedCc2CanvasCellCache(tileset));
      })
      .catch((error) => {
        if (cancelled) return;
        setTilesetError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cellCache) return;
    if (
      !drawnRef.current ||
      canvas.width !== boardWidth ||
      canvas.height !== boardHeight ||
      snapshot.changedIndices.length > snapshot.map.tiles.length / 2
    ) {
      drawCc2MapToCanvas(canvas, snapshot.map, cellCache);
      drawnRef.current = true;
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      setTilesetError("Canvas 2D context unavailable");
      return;
    }
    drawCc2CellsToContext(context, snapshot.map, snapshot.changedIndices, cellCache);
  }, [boardHeight, boardWidth, cellCache, snapshot]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="NotCC engine replay map"
        role="img"
        width={boardWidth}
        height={boardHeight}
        style={{ width: scaledWidth, height: scaledHeight }}
      />
      {!cellCache || tilesetError ? (
        <div className={`islideCanvasState is-${tilesetError ? "error" : "loading"}`}>
          {tilesetError ?? "Loading CC2 tiles…"}
        </div>
      ) : null}
    </>
  );
}

function PreviewToolbar({
  eyebrow,
  title,
  detail,
  zoom,
  minZoom,
  maxZoom,
  step,
  resetZoom,
  onZoomChange,
}: Readonly<{
  eyebrow: string;
  title: string;
  detail: string;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  step: number;
  resetZoom: number;
  onZoomChange: (zoom: number) => void;
}>) {
  return (
    <header className="islidePreviewToolbar">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <span>{detail}</span>
      </div>
      <div className="islideZoomControls" aria-label={`${title} zoom controls`}>
        <button
          type="button"
          aria-label={`Zoom out ${title.toLowerCase()}`}
          disabled={zoom <= minZoom}
          onClick={() => onZoomChange(clamp(zoom - step, minZoom, maxZoom))}
        >
          −
        </button>
        <output aria-label={`${title} zoom`}>{formatPercent(zoom)}</output>
        <button
          type="button"
          aria-label={`Zoom in ${title.toLowerCase()}`}
          disabled={zoom >= maxZoom}
          onClick={() => onZoomChange(clamp(zoom + step, minZoom, maxZoom))}
        >
          +
        </button>
        <button type="button" className="islideZoomReset" onClick={() => onZoomChange(resetZoom)}>
          Reset
        </button>
      </div>
    </header>
  );
}

function getArtifactCopy(
  state: ArtifactState,
  currentRevision: number,
): Readonly<{
  tone: "working" | "success" | "error";
  glyph: string;
  title: string;
  detail: string;
}> {
  if (state.revision !== currentRevision || state.kind === "preparing") {
    return {
      tone: "working",
      glyph: "◇",
      title: "Preparing C2M and replay",
      detail: "The map and graph remain available while replay construction runs.",
    };
  }

  if (state.kind === "error") {
    return {
      tone: "error",
      glyph: "!",
      title: "Replay package unavailable",
      detail: state.message,
    };
  }

  return {
    tone: "success",
    glyph: "◆",
    title: "C2M and replay ready",
    detail: `${state.artifact.replayFrames} frames / hash ${state.artifact.replayHashHex.slice(0, 12)}…`,
  };
}

function getValidationCopy(state: ValidationState): Readonly<{
  tone: "idle" | "working" | "success" | "error" | "stale";
  title: string;
  detail: string;
}> {
  switch (state.kind) {
    case "idle":
      return {
        tone: "idle",
        title: "Replay not validated",
        detail: "Run the engine check when this constellation is ready.",
      };
    case "stale":
      return {
        tone: "stale",
        title: "Validation is stale",
        detail: "This generation has not been checked yet.",
      };
    case "running":
      return {
        tone: "working",
        title: "Running strict replay",
        detail: "Checking container, hash, inputs, chips, socket, and exit.",
      };
    case "error":
      return { tone: "error", title: "Validator error", detail: state.message };
    case "complete":
      return state.result.ok
        ? {
            tone: "success",
            title: "Valid replay",
            detail: `${state.result.engineOutcome} / ${state.result.chipsLeft} chips left / ${state.result.postInputTicks} grace ticks`,
          }
        : {
            tone: "error",
            title: "Replay failed validation",
            detail: `${state.result.engineOutcome} / hash ${state.result.replayHashValid ? "valid" : "invalid"} / ${state.result.chipsLeft} chips left`,
          };
  }
}

function getSaveCopy(
  state: SaveState,
): Readonly<{ tone: "success" | "error"; text: string }> | null {
  switch (state.kind) {
    case "saved":
      return { tone: "success", text: state.message };
    case "error":
      return { tone: "error", text: state.message };
    default:
      return null;
  }
}
