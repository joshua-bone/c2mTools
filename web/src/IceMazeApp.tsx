import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  serializeIceMazeGraphDebug,
  serializeProceduralRegionDebug,
} from "../../procedural_generation/ice_maze.js";
import {
  buildReciprocalIceMazeGraph,
  extractIceMazeGraph,
  type ReciprocalIceMazeGraph,
} from "../../procedural_generation/ice_maze_graph.js";
import { BOARD_TILE_PIXEL_SIZE } from "./boardCanvasPresentation.js";
import { getSharedCc2CanvasCellCache, type Cc2CanvasCellCache } from "./cc2CanvasCache.js";
import { drawCc2MapToCanvas } from "./canvasMapRenderer.js";
import { loadCc2Tileset } from "./loadCc2Tileset.js";
import {
  applyIceMazeEditorBrush,
  buildIceMazeRegion,
  createEmptyIceMazeEditorState,
  createSampleIceMazeEditorState,
  resizeIceMazeEditorState,
  type IceMazeEditorBrush,
  type IceMazeEditorState,
  type IceMazeRegionCell,
} from "./iceMazeEditorState.js";
import "./iceMaze.css";

const TILESET_URL = `${import.meta.env.BASE_URL}cc2/spritesheet.png`;

type GraphOverlayMode = "reciprocal" | "directed";

type BrushOption = Readonly<{
  id: string;
  label: string;
  brush: IceMazeEditorBrush;
}>;

const TERRAIN_BRUSHES: ReadonlyArray<BrushOption> = Object.freeze([
  { id: "wall", label: "Wall", brush: { kind: "terrain", tile: "WALL" } },
  { id: "floor", label: "Floor", brush: { kind: "terrain", tile: "FLOOR" } },
  { id: "ice", label: "Ice", brush: { kind: "terrain", tile: "ICE" } },
  { id: "corner-nw", label: "Corner NW", brush: { kind: "terrain", tile: "ICE_CORNER_NW" } },
  { id: "corner-ne", label: "Corner NE", brush: { kind: "terrain", tile: "ICE_CORNER_NE" } },
  { id: "corner-se", label: "Corner SE", brush: { kind: "terrain", tile: "ICE_CORNER_SE" } },
  { id: "corner-sw", label: "Corner SW", brush: { kind: "terrain", tile: "ICE_CORNER_SW" } },
  { id: "socket", label: "Socket", brush: { kind: "terrain", tile: "CHIP_SOCKET" } },
  { id: "exit", label: "Exit", brush: { kind: "terrain", tile: "EXIT" } },
]);

const ITEM_BRUSHES: ReadonlyArray<BrushOption> = Object.freeze([
  { id: "chip", label: "Chip", brush: { kind: "item", itemTile: "IC_CHIP" } },
  { id: "clear-item", label: "Clear Item", brush: { kind: "item", itemTile: null } },
]);

const REGION_BRUSHES: ReadonlyArray<BrushOption> = Object.freeze([
  { id: "allow", label: "Allow", brush: { kind: "region", regionCell: "allowed" } },
  { id: "reserve", label: "Reserve", brush: { kind: "region", regionCell: "reserved" } },
  { id: "block", label: "Block", brush: { kind: "region", regionCell: "blocked" } },
  { id: "entry", label: "Entry Anchor", brush: { kind: "anchor", anchor: "entry" } },
  { id: "exit-anchor", label: "Exit Anchor", brush: { kind: "anchor", anchor: "exit" } },
  { id: "clear-anchor", label: "Clear Anchor", brush: { kind: "anchor-clear" } },
]);

function getRegionCellColor(regionCell: IceMazeRegionCell): string {
  switch (regionCell) {
    case "allowed":
      return "rgba(35, 95, 122, 0.14)";
    case "reserved":
      return "rgba(186, 130, 55, 0.24)";
    case "blocked":
      return "rgba(0, 0, 0, 0)";
  }
}

function getNodeColor(role: string): string {
  switch (role) {
    case "start":
      return "#2a8f5a";
    case "exit":
      return "#a24632";
    case "chip":
      return "#bf8a18";
    case "socket":
      return "#7d5298";
    default:
      return "#235f7a";
  }
}

function buildBrushId(brush: IceMazeEditorBrush): string {
  return JSON.stringify(brush);
}

function parseCellPoint(
  event: ReactPointerEvent<HTMLDivElement>,
  width: number,
  height: number,
  zoom: number,
): Readonly<{ x: number; y: number }> | null {
  const rect = event.currentTarget.getBoundingClientRect();
  const scaledTileSize = BOARD_TILE_PIXEL_SIZE * zoom;
  const x = Math.floor((event.clientX - rect.left) / scaledTileSize);
  const y = Math.floor((event.clientY - rect.top) / scaledTileSize);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y };
}

function formatAnchorSummary(state: IceMazeEditorState): string {
  const parts = [
    state.anchors.entry
      ? `entry (${state.anchors.entry.x},${state.anchors.entry.y})`
      : "entry none",
    state.anchors.exit ? `exit (${state.anchors.exit.x},${state.anchors.exit.y})` : "exit none",
  ];
  return parts.join(" | ");
}

function collectGraphMetrics(
  graph: ReturnType<typeof extractIceMazeGraph>,
  reciprocalGraph: ReciprocalIceMazeGraph,
): Readonly<{
  leafCount: number;
  chipCount: number;
  socketCount: number;
}> {
  return {
    leafCount: graph.nodes.filter(
      (node) => node.role === "leaf" || node.role === "chip" || node.role === "exit",
    ).length,
    chipCount: graph.nodes.filter((node) => node.role === "chip").length,
    socketCount: graph.nodes.filter((node) => node.role === "socket").length,
  };
}

export default function IceMazeApp() {
  const [editorState, setEditorState] = useState<IceMazeEditorState>(() =>
    createSampleIceMazeEditorState(),
  );
  const [widthDraft, setWidthDraft] = useState(String(editorState.map.width));
  const [heightDraft, setHeightDraft] = useState(String(editorState.map.height));
  const [activeBrush, setActiveBrush] = useState<IceMazeEditorBrush>(TERRAIN_BRUSHES[2]!.brush);
  const [zoom, setZoom] = useState(1.5);
  const [showRegionOverlay, setShowRegionOverlay] = useState(true);
  const [showGraphOverlay, setShowGraphOverlay] = useState(true);
  const [graphOverlayMode, setGraphOverlayMode] = useState<GraphOverlayMode>("reciprocal");
  const [tilesetError, setTilesetError] = useState<string | null>(null);
  const [cellCache, setCellCache] = useState<Cc2CanvasCellCache | null>(null);
  const [paintMessage, setPaintMessage] = useState<string | null>(null);
  const [isPainting, setIsPainting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeBrushId = buildBrushId(activeBrush);

  const graphState = useMemo(() => {
    try {
      const region = buildIceMazeRegion(editorState);
      const graph = extractIceMazeGraph(editorState.map, region);
      const reciprocalGraph = buildReciprocalIceMazeGraph(graph);
      return {
        region,
        graph,
        reciprocalGraph,
        error: null,
      };
    } catch (error) {
      return {
        region: null,
        graph: null,
        reciprocalGraph: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [editorState]);

  const graphMetrics = useMemo(() => {
    if (!graphState.graph || !graphState.reciprocalGraph) return null;
    return collectGraphMetrics(graphState.graph, graphState.reciprocalGraph);
  }, [graphState]);

  useEffect(() => {
    setWidthDraft(String(editorState.map.width));
    setHeightDraft(String(editorState.map.height));
  }, [editorState.map.height, editorState.map.width]);

  useEffect(() => {
    let cancelled = false;
    loadCc2Tileset(TILESET_URL)
      .then((tileset) => {
        if (cancelled) return;
        setCellCache(getSharedCc2CanvasCellCache(tileset));
        setTilesetError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setCellCache(null);
        setTilesetError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cellCache || !canvasRef.current) return;
    drawCc2MapToCanvas(canvasRef.current, editorState.map, cellCache);
  }, [cellCache, editorState.map]);

  const boardPixelWidth = editorState.map.width * BOARD_TILE_PIXEL_SIZE;
  const boardPixelHeight = editorState.map.height * BOARD_TILE_PIXEL_SIZE;

  function applyBrushAtPoint(point: Readonly<{ x: number; y: number }>): void {
    setEditorState((current) => applyIceMazeEditorBrush(current, point, activeBrush));
  }

  function handleBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const point = parseCellPoint(event, editorState.map.width, editorState.map.height, zoom);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPainting(true);
    applyBrushAtPoint(point);
  }

  function handleBoardPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const point = parseCellPoint(event, editorState.map.width, editorState.map.height, zoom);
    if (!point) return;
    setPaintMessage(`cell (${point.x},${point.y})`);
    if (!isPainting) return;
    applyBrushAtPoint(point);
  }

  function handleBoardPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPainting(false);
  }

  function handleResizeApply(): void {
    const width = Number(widthDraft);
    const height = Number(heightDraft);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4) {
      setPaintMessage("size must be integers >= 4");
      return;
    }

    setEditorState((current) => resizeIceMazeEditorState(current, width, height));
    setPaintMessage(`resized to ${width}x${height}`);
  }

  const graphDebugText = useMemo(() => {
    if (!graphState.graph) return graphState.error ?? "graph unavailable";
    return serializeIceMazeGraphDebug(graphState.graph);
  }, [graphState]);

  const regionDebugText = useMemo(() => {
    if (!graphState.region) return graphState.error ?? "region unavailable";
    return serializeProceduralRegionDebug(graphState.region);
  }, [graphState]);

  return (
    <div className="iceMazeShell">
      <header className="iceMazeHeader">
        <div>
          <div className="iceMazeKicker">Hidden Tooling Surface</div>
          <h1 className="iceMazeTitle">Ice Maze Lab</h1>
          <p className="iceMazeSubtitle">
            Paint terrain, paint the active region, place entry and exit anchors, then inspect the
            extracted slide graph.
          </p>
        </div>
        <div className="iceMazeMeta">
          <div>
            {editorState.map.width}x{editorState.map.height} board
          </div>
          <div>{formatAnchorSummary(editorState)}</div>
        </div>
      </header>

      <div className="iceMazeLayout">
        <aside className="iceMazePanel iceMazeControls">
          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Session</div>
            <div className="iceMazeButtonRow">
              <button
                type="button"
                onClick={() => setEditorState(createSampleIceMazeEditorState())}
              >
                Load Sample
              </button>
              <button type="button" onClick={() => setEditorState(createEmptyIceMazeEditorState())}>
                Clear
              </button>
            </div>
          </section>

          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Board Size</div>
            <div className="iceMazeFieldGrid">
              <label>
                <span>Width</span>
                <input value={widthDraft} onChange={(event) => setWidthDraft(event.target.value)} />
              </label>
              <label>
                <span>Height</span>
                <input
                  value={heightDraft}
                  onChange={(event) => setHeightDraft(event.target.value)}
                />
              </label>
            </div>
            <button type="button" onClick={handleResizeApply}>
              Resize
            </button>
          </section>

          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Terrain Brushes</div>
            <div className="iceMazeBrushGrid">
              {TERRAIN_BRUSHES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={activeBrushId === buildBrushId(option.brush) ? "active" : undefined}
                  onClick={() => setActiveBrush(option.brush)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Item Brushes</div>
            <div className="iceMazeBrushGrid">
              {ITEM_BRUSHES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={activeBrushId === buildBrushId(option.brush) ? "active" : undefined}
                  onClick={() => setActiveBrush(option.brush)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Region Brushes</div>
            <div className="iceMazeBrushGrid">
              {REGION_BRUSHES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={activeBrushId === buildBrushId(option.brush) ? "active" : undefined}
                  onClick={() => setActiveBrush(option.brush)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Overlays</div>
            <label className="iceMazeCheckbox">
              <input
                type="checkbox"
                checked={showRegionOverlay}
                onChange={(event) => setShowRegionOverlay(event.target.checked)}
              />
              <span>Show region mask</span>
            </label>
            <label className="iceMazeCheckbox">
              <input
                type="checkbox"
                checked={showGraphOverlay}
                onChange={(event) => setShowGraphOverlay(event.target.checked)}
              />
              <span>Show graph</span>
            </label>
            <label className="iceMazeCheckbox">
              <span>Graph mode</span>
              <select
                value={graphOverlayMode}
                onChange={(event) => setGraphOverlayMode(event.target.value as GraphOverlayMode)}
              >
                <option value="reciprocal">Reciprocal</option>
                <option value="directed">Directed</option>
              </select>
            </label>
            <label className="iceMazeCheckbox">
              <span>Zoom</span>
              <input
                type="range"
                min="0.75"
                max="2.5"
                step="0.25"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </section>

          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Status</div>
            <div className="iceMazeStatList">
              <div>{paintMessage ?? "paint the board to inspect the graph"}</div>
              <div>{tilesetError ?? "tileset ready"}</div>
              <div>{graphState.error ?? "graph extracted"}</div>
              {graphMetrics ? (
                <>
                  <div>{graphState.graph!.nodes.length} nodes</div>
                  <div>{graphState.graph!.edges.length} directed edges</div>
                  <div>{graphState.reciprocalGraph!.edges.length} reciprocal edges</div>
                  <div>{graphMetrics.leafCount} leaves</div>
                  <div>{graphMetrics.chipCount} chip leaves</div>
                  <div>{graphMetrics.socketCount} sockets</div>
                </>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="iceMazePanel iceMazeBoardPanel">
          <div className="iceMazeBoardScroller">
            <div
              className="iceMazeBoard"
              style={{
                width: boardPixelWidth * zoom,
                height: boardPixelHeight * zoom,
              }}
              onPointerDown={handleBoardPointerDown}
              onPointerMove={handleBoardPointerMove}
              onPointerUp={handleBoardPointerUp}
              onPointerLeave={() => setIsPainting(false)}
            >
              <canvas
                ref={canvasRef}
                width={boardPixelWidth}
                height={boardPixelHeight}
                style={{
                  width: boardPixelWidth * zoom,
                  height: boardPixelHeight * zoom,
                }}
              />

              <svg
                className="iceMazeOverlay"
                viewBox={`0 0 ${boardPixelWidth} ${boardPixelHeight}`}
                width={boardPixelWidth * zoom}
                height={boardPixelHeight * zoom}
              >
                {showRegionOverlay
                  ? editorState.regionCells.map((regionCell, index) => {
                      if (regionCell === "blocked") return null;
                      const x = (index % editorState.map.width) * BOARD_TILE_PIXEL_SIZE;
                      const y = Math.floor(index / editorState.map.width) * BOARD_TILE_PIXEL_SIZE;
                      return (
                        <rect
                          key={`region-${index}`}
                          x={x}
                          y={y}
                          width={BOARD_TILE_PIXEL_SIZE}
                          height={BOARD_TILE_PIXEL_SIZE}
                          fill={getRegionCellColor(regionCell)}
                          stroke={
                            regionCell === "reserved"
                              ? "rgba(186, 130, 55, 0.9)"
                              : "rgba(35, 95, 122, 0.42)"
                          }
                          strokeWidth="1"
                        />
                      );
                    })
                  : null}

                {editorState.anchors.entry ? (
                  <text
                    x={editorState.anchors.entry.x * BOARD_TILE_PIXEL_SIZE + 8}
                    y={editorState.anchors.entry.y * BOARD_TILE_PIXEL_SIZE + 12}
                    className="iceMazeAnchorText entry"
                  >
                    S
                  </text>
                ) : null}
                {editorState.anchors.exit ? (
                  <text
                    x={editorState.anchors.exit.x * BOARD_TILE_PIXEL_SIZE + 8}
                    y={editorState.anchors.exit.y * BOARD_TILE_PIXEL_SIZE + 12}
                    className="iceMazeAnchorText exit"
                  >
                    E
                  </text>
                ) : null}

                {showGraphOverlay && graphState.graph
                  ? graphOverlayMode === "directed"
                    ? graphState.graph.edges.map((edge) => {
                        const polyline = [
                          graphState.graph!.nodes.find((node) => node.id === edge.fromNodeId)!
                            .point,
                          ...edge.path,
                        ]
                          .map(
                            (point) =>
                              `${point.x * BOARD_TILE_PIXEL_SIZE + BOARD_TILE_PIXEL_SIZE / 2},${point.y * BOARD_TILE_PIXEL_SIZE + BOARD_TILE_PIXEL_SIZE / 2}`,
                          )
                          .join(" ");

                        return (
                          <polyline
                            key={edge.id}
                            className="iceMazeDirectedEdge"
                            points={polyline}
                          />
                        );
                      })
                    : graphState.reciprocalGraph?.edges.map((reciprocalEdge) => {
                        const edge = graphState.graph!.edges.find(
                          (candidate) =>
                            candidate.id === reciprocalEdge.forwardEdgeIds[0] ||
                            candidate.id === reciprocalEdge.reverseEdgeIds[0],
                        );
                        if (!edge) return null;
                        const startNode = graphState.graph!.nodes.find(
                          (node) => node.id === edge.fromNodeId,
                        )!;
                        const polyline = [startNode.point, ...edge.path]
                          .map(
                            (point) =>
                              `${point.x * BOARD_TILE_PIXEL_SIZE + BOARD_TILE_PIXEL_SIZE / 2},${point.y * BOARD_TILE_PIXEL_SIZE + BOARD_TILE_PIXEL_SIZE / 2}`,
                          )
                          .join(" ");
                        return (
                          <polyline
                            key={reciprocalEdge.id}
                            className="iceMazeReciprocalEdge"
                            points={polyline}
                          />
                        );
                      })
                  : null}

                {showGraphOverlay && graphState.graph
                  ? graphState.graph.nodes.map((node) => (
                      <g key={node.id}>
                        <circle
                          cx={node.point.x * BOARD_TILE_PIXEL_SIZE + BOARD_TILE_PIXEL_SIZE / 2}
                          cy={node.point.y * BOARD_TILE_PIXEL_SIZE + BOARD_TILE_PIXEL_SIZE / 2}
                          r="6"
                          fill={getNodeColor(node.role)}
                          stroke="rgba(255,255,255,0.95)"
                          strokeWidth="2"
                        />
                        <text
                          x={node.point.x * BOARD_TILE_PIXEL_SIZE + BOARD_TILE_PIXEL_SIZE / 2}
                          y={node.point.y * BOARD_TILE_PIXEL_SIZE + BOARD_TILE_PIXEL_SIZE / 2 - 10}
                          textAnchor="middle"
                          className="iceMazeNodeLabel"
                        >
                          {node.role === "junction" ? "" : node.role}
                        </text>
                      </g>
                    ))
                  : null}
              </svg>
            </div>
          </div>
        </main>

        <aside className="iceMazePanel iceMazeDebugPanel">
          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Region Debug</div>
            <pre className="iceMazeDebugText">{regionDebugText}</pre>
          </section>
          <section className="iceMazeSection">
            <div className="iceMazeSectionLabel">Graph Debug</div>
            <pre className="iceMazeDebugText">{graphDebugText}</pre>
          </section>
        </aside>
      </div>
    </div>
  );
}
