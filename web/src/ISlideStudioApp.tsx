import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  DEFAULT_ISLIDE_GENERATOR_CONFIG,
  generateISlideLayout,
} from "../../procedural_generation/islide_generator.js";
import {
  buildISlideC2mArtifact,
  validateISlideC2m,
} from "../../procedural_generation/islide_replay.js";
import { BOARD_TILE_PIXEL_SIZE } from "./boardCanvasPresentation.js";
import { getSharedCc2CanvasCellCache } from "./cc2CanvasCache.js";
import { drawCc2MapToCanvas } from "./canvasMapRenderer.js";
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

type GeneratorConfig = Parameters<typeof generateISlideLayout>[0];
type ISlideLayout = ReturnType<typeof generateISlideLayout>;
type ISlideArtifact = ReturnType<typeof buildISlideC2mArtifact>;
type ISlideValidation = ReturnType<typeof validateISlideC2m>;
type PreviewTab = "map" | "graph";

type GeneratedLevel = Readonly<{
  config: GeneratorConfig;
  layout: ISlideLayout;
  revision: number;
}>;

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
  points: ReadonlyArray<GraphPoint>;
  kind: string;
}>;

type ViewGraph = Readonly<{
  nodes: ReadonlyArray<ViewGraphNode>;
  edges: ReadonlyArray<ViewGraphEdge>;
}>;

type SliderKey =
  | "chipCount"
  | "branchCount"
  | "loopCount"
  | "sparkleDensity"
  | "routeSpread"
  | "asymmetry";

type SliderDefinition = Readonly<{
  key: SliderKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}>;

const SLIDERS: ReadonlyArray<SliderDefinition> = Object.freeze([
  {
    key: "chipCount",
    label: "Chips",
    description: "Collectibles distributed through the route constellation.",
    min: 16,
    max: 160,
    step: 1,
  },
  {
    key: "branchCount",
    label: "Branches",
    description: "Major routes expanding away from the center island.",
    min: 4,
    max: 8,
    step: 1,
  },
  {
    key: "loopCount",
    label: "Loops",
    description: "Routes that reconnect instead of ending as tails.",
    min: 0,
    max: 2,
    step: 1,
  },
  {
    key: "sparkleDensity",
    label: "Sparkle density",
    description: "Locally symmetric groups of four ice corners.",
    min: 20,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "routeSpread",
    label: "Route spread",
    description: "How widely playable lines occupy the 99x99 field.",
    min: 20,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "asymmetry",
    label: "Asymmetry",
    description: "Global irregularity while preserving local four-corner rhythm.",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },
]);

function cloneConfig(config: GeneratorConfig): GeneratorConfig {
  return { ...config };
}

function buildGeneratedLevel(config: GeneratorConfig, revision: number): GeneratedLevel {
  const layout = generateISlideLayout(cloneConfig(config));
  return {
    config: layout.config,
    layout,
    revision,
  };
}

function configFingerprint(config: GeneratorConfig): string {
  return [
    config.seed,
    config.chipCount,
    config.branchCount,
    config.loopCount,
    config.sparkleDensity,
    config.routeSpread,
    config.asymmetry,
  ].join("|");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
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

function buildViewGraph(layout: ISlideLayout): ViewGraph {
  const rawGraph = layout.graph as unknown as {
    nodes?: ReadonlyArray<Record<string, unknown>>;
    edges?: ReadonlyArray<Record<string, unknown>>;
    chains?: ReadonlyArray<Record<string, unknown>>;
  };
  const rawNodes = rawGraph.nodes ?? [];
  const fallbackRadius = 40;
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
    return {
      id,
      role,
      point,
      label: stringFromUnknown(node.label, role === "chip" ? `Chip ${index + 1}` : role),
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: ViewGraphEdge[] = [];

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

  return { nodes, edges };
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

export default function ISlideStudioApp() {
  const [draftConfig, setDraftConfig] = useState<GeneratorConfig>(() =>
    cloneConfig(DEFAULT_ISLIDE_GENERATOR_CONFIG),
  );
  const [generated, setGenerated] = useState<GeneratedLevel>(() =>
    buildGeneratedLevel(DEFAULT_ISLIDE_GENERATOR_CONFIG, 1),
  );
  const [artifactState, setArtifactState] = useState<ArtifactState>({
    kind: "preparing",
    revision: 1,
  });
  const [activeTab, setActiveTab] = useState<PreviewTab>("map");
  const [mapZoom, setMapZoom] = useState(0.25);
  const [graphZoom, setGraphZoom] = useState(0.8);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationState>({ kind: "idle" });
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const artifactRequestRef = useRef(0);
  const validationRequestRef = useRef(0);

  const draftIsPending = configFingerprint(draftConfig) !== configFingerprint(generated.config);

  useEffect(() => {
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
  }, [generated.layout, generated.revision]);

  function setDraftValue(key: SliderKey, value: number): void {
    setDraftConfig((current) => {
      const next = { ...current, [key]: value };
      if (key === "branchCount" && next.loopCount >= value) {
        next.loopCount = Math.max(0, value - 1);
      }
      if (key === "branchCount") {
        next.chipCount = Math.min(next.chipCount, value * 20);
      }
      if (key === "chipCount") {
        next.branchCount = Math.max(next.branchCount, Math.ceil(value / 20));
      }
      return next;
    });
  }

  function handleGenerate(): void {
    validationRequestRef.current += 1;
    try {
      const next = buildGeneratedLevel(draftConfig, generated.revision + 1);
      artifactRequestRef.current += 1;
      setGenerated(next);
      setArtifactState({ kind: "preparing", revision: next.revision });
      setGenerationError(null);
      setSaveState({ kind: "idle" });
      setValidation((current) => (current.kind === "idle" ? current : { kind: "stale" }));
    } catch (error) {
      setGenerationError(errorMessage(error));
    }
  }

  async function handleValidate(): Promise<void> {
    if (artifactState.kind !== "ready" || artifactState.revision !== generated.revision) return;

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
    if (artifactState.kind !== "ready" || artifactState.revision !== generated.revision) return;

    const fileName = `i-slide-99x99-${formatFileStem(generated.config.seed)}-${generated.layout.fingerprint.slice(0, 8)}.c2m`;
    const artifact = artifactState.artifact;
    setSaveState({ kind: "saving" });
    try {
      await platform.saveC2mFile(fileName, artifact.c2mBytes);
      setSaveState({ kind: "saved", message: `Saved ${fileName}` });
    } catch (error) {
      setSaveState({ kind: "error", message: errorMessage(error) });
    }
  }

  function selectTab(tab: PreviewTab): void {
    setActiveTab(tab);
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextTab: PreviewTab = activeTab === "map" ? "graph" : "map";
    setActiveTab(nextTab);
    document.getElementById(`islide-${nextTab}-tab`)?.focus();
  }

  const artifactReady =
    artifactState.kind === "ready" && artifactState.revision === generated.revision;
  const artifactCopy = getArtifactCopy(artifactState, generated.revision);
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
                value={draftConfig.seed}
                onChange={(event) =>
                  setDraftConfig((current) => ({ ...current, seed: event.target.value }))
                }
                spellCheck={false}
              />
            </label>
            <p className="islideFieldNote">
              The same seed and settings always produce the same map, graph, and replay.
            </p>
          </section>

          <section className="islideControlSection" aria-labelledby="islide-shape-title">
            <div className="islideSectionHeading">
              <div>
                <span className="islideSectionNumber">02</span>
                <h2 id="islide-shape-title">Shape the ice</h2>
              </div>
            </div>
            <div className="islideSliders">
              {SLIDERS.map((definition) => (
                <GeneratorSlider
                  key={definition.key}
                  definition={definition}
                  value={draftConfig[definition.key]}
                  onChange={(value) => setDraftValue(definition.key, value)}
                />
              ))}
            </div>
          </section>

          <section
            className="islideControlSection islideMetrics"
            aria-labelledby="islide-level-title"
          >
            <div className="islideSectionHeading">
              <div>
                <span className="islideSectionNumber">03</span>
                <h2 id="islide-level-title">Generated level</h2>
              </div>
              <span className="islideRevision">#{generated.revision}</span>
            </div>
            <dl className="islideMetricGrid">
              <Metric label="Chips" value={String(generated.config.chipCount)} />
              <Metric label="Routes" value={String(generated.layout.graph.chains.length)} />
              <Metric
                label="Sparkles"
                value={String(generated.layout.metrics.completeCornerGroups)}
              />
              <Metric label="Crossings" value={String(generated.layout.metrics.routeCrossings)} />
            </dl>
            <div className="islideArtifactMeta">
              <span>Fingerprint</span>
              <code>{generated.layout.fingerprint}</code>
              <span>C2M / replay</span>
              <strong>
                {artifactReady
                  ? `${formatBytes(artifactState.artifact.c2mBytes.length)} / ${artifactState.artifact.replayBytes.length} bytes`
                  : artifactState.kind === "error"
                    ? "Unavailable"
                    : "Preparing…"}
              </strong>
            </div>
          </section>
        </div>

        <footer className="islideActions">
          {generationError ? (
            <p className="islideActionMessage is-error" role="alert">
              {generationError}
            </p>
          ) : null}
          <button className="islideGenerateButton" type="button" onClick={handleGenerate}>
            <span>Generate level</span>
            <span aria-hidden="true">✦</span>
          </button>
          <div className="islideSecondaryActions">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={!artifactReady || saveState.kind === "saving"}
            >
              {artifactState.kind === "preparing"
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
              {artifactState.kind === "preparing"
                ? "Preparing replay…"
                : validation.kind === "running"
                  ? "Validating…"
                  : "Validate replay"}
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
              onClick={() => selectTab("map")}
              onKeyDown={handleTabKeyDown}
            >
              Map
              <span>99 × 99</span>
            </button>
            <button
              id="islide-graph-tab"
              type="button"
              role="tab"
              aria-controls="islide-graph-panel"
              aria-selected={activeTab === "graph"}
              tabIndex={activeTab === "graph" ? 0 : -1}
              onClick={() => selectTab("graph")}
              onKeyDown={handleTabKeyDown}
            >
              Level graph
              <span>{generated.layout.graph.nodes.length} nodes</span>
            </button>
          </div>
          <div className="islideWorkspaceSummary" aria-label="Applied generation summary">
            <span>{generated.config.seed}</span>
            <strong>{generated.config.chipCount} chips</strong>
          </div>
        </header>

        {activeTab === "map" ? (
          <MapPreview
            key={`map-${generated.revision}`}
            layout={generated.layout}
            zoom={mapZoom}
            onZoomChange={setMapZoom}
          />
        ) : (
          <GraphPreview
            key={`graph-${generated.revision}`}
            layout={generated.layout}
            zoom={graphZoom}
            onZoomChange={setGraphZoom}
          />
        )}
      </main>
    </div>
  );
}

function GeneratorSlider({
  definition,
  value,
  onChange,
}: Readonly<{
  definition: SliderDefinition;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="islideSlider">
      <span className="islideSliderTopline">
        <strong>{definition.label}</strong>
        <output>{`${value}${definition.suffix ?? ""}`}</output>
      </span>
      <input
        type="range"
        min={definition.min}
        max={definition.max}
        step={definition.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="islideSliderDescription">{definition.description}</span>
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
  zoom,
  onZoomChange,
}: Readonly<{
  layout: ISlideLayout;
  zoom: number;
  onZoomChange: (zoom: number) => void;
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

function GraphPreview({
  layout,
  zoom,
  onZoomChange,
}: Readonly<{
  layout: ISlideLayout;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}>) {
  const graph = useMemo(() => buildViewGraph(layout), [layout]);
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
              {graph.edges.map((edge) => (
                <polyline
                  key={edge.id}
                  className={`islideGraphEdge is-${graphRoleClass(edge.kind)}`}
                  points={edge.points
                    .map((point) => `${graphCoordinate(point.x)},${graphCoordinate(point.y)}`)
                    .join(" ")}
                />
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
