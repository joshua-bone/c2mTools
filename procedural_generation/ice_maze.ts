import type { Dir } from "../src/c2m/mapCodec.js";

export type GridPoint = Readonly<{
  x: number;
  y: number;
}>;

export type GridRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RegionAnchorKind = "entry" | "exit";

export type ProceduralRegionAnchor = Readonly<{
  id: string;
  kind: RegionAnchorKind;
  point: GridPoint;
  dir?: Dir;
}>;

export type AsciiMaskLegendEntry =
  | "blocked"
  | "allowed"
  | "reserved"
  | Readonly<{
      kind: "anchor";
      anchorId: string;
      anchorKind: RegionAnchorKind;
      dir?: Dir;
      reserved?: boolean;
    }>;

export type ProceduralRegionMaskSource =
  | Readonly<{
      kind: "rect";
      rect: GridRect;
    }>
  | Readonly<{
      kind: "points";
      points: ReadonlyArray<GridPoint>;
    }>
  | Readonly<{
      kind: "ascii";
      rows: ReadonlyArray<string>;
      origin?: GridPoint;
      legend?: Readonly<Record<string, AsciiMaskLegendEntry>>;
    }>;

export type ProceduralRegionInput = Readonly<{
  name?: string;
  board: Readonly<{
    width: number;
    height: number;
  }>;
  mask: ProceduralRegionMaskSource;
  reservedPoints?: ReadonlyArray<GridPoint>;
  anchors?: ReadonlyArray<ProceduralRegionAnchor>;
}>;

export type ProceduralRegion = Readonly<{
  name?: string;
  board: Readonly<{
    width: number;
    height: number;
  }>;
  bounds: GridRect;
  allowedPoints: ReadonlyArray<GridPoint>;
  reservedPoints: ReadonlyArray<GridPoint>;
  anchors: ReadonlyArray<ProceduralRegionAnchor>;
}>;

export type IceControlNodeRole = "start" | "junction" | "leaf" | "chip" | "socket" | "exit";

export type IceControlNode = Readonly<{
  id: string;
  point: GridPoint;
  role: IceControlNodeRole;
  anchorId?: string;
}>;

export type IceSlideEdge = Readonly<{
  id: string;
  fromNodeId: string;
  toNodeId: string;
  entryDir: Dir;
  exitDir: Dir;
  path: ReadonlyArray<GridPoint>;
}>;

export type GatedExitCutMetadata = Readonly<{
  socketNodeIds: ReadonlyArray<string>;
  boundaryNodeIds: ReadonlyArray<string>;
  exitRegionNodeIds: ReadonlyArray<string>;
  explorableNodeIds: ReadonlyArray<string>;
}>;

export type ExtractedIceSlideGraph = Readonly<{
  region: ProceduralRegion;
  nodes: ReadonlyArray<IceControlNode>;
  edges: ReadonlyArray<IceSlideEdge>;
  exitCut?: GatedExitCutMetadata;
}>;

const DEFAULT_ASCII_LEGEND: Readonly<Record<string, AsciiMaskLegendEntry>> = Object.freeze({
  "#": "blocked",
  ".": "allowed",
  " ": "blocked",
  R: "reserved",
  S: {
    kind: "anchor",
    anchorId: "entry",
    anchorKind: "entry",
  },
  E: {
    kind: "anchor",
    anchorId: "exit",
    anchorKind: "exit",
  },
} satisfies Record<string, AsciiMaskLegendEntry>);

function comparePoints(left: GridPoint, right: GridPoint): number {
  if (left.y !== right.y) return left.y - right.y;
  return left.x - right.x;
}

function compareAnchorPoints(left: ProceduralRegionAnchor, right: ProceduralRegionAnchor): number {
  return comparePoints(left.point, right.point);
}

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isPointInBounds(
  point: GridPoint,
  board: Readonly<{
    width: number;
    height: number;
  }>,
): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < board.width && point.y < board.height;
}

function assertPointInBounds(
  point: GridPoint,
  board: Readonly<{
    width: number;
    height: number;
  }>,
  label: string,
): void {
  if (isPointInBounds(point, board)) return;
  throw new Error(
    `${label} (${point.x},${point.y}) lies outside board ${board.width}x${board.height}`,
  );
}

function dedupePoints(points: ReadonlyArray<GridPoint>): GridPoint[] {
  const seen = new Set<string>();
  const out: GridPoint[] = [];

  for (const point of points) {
    const key = pointKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: point.x, y: point.y });
  }

  return out.sort(comparePoints);
}

function sortAnchors(anchors: ReadonlyArray<ProceduralRegionAnchor>): ProceduralRegionAnchor[] {
  return [...anchors].sort((left, right) => {
    const kindCompare = left.kind.localeCompare(right.kind);
    if (kindCompare !== 0) return kindCompare;

    const idCompare = left.id.localeCompare(right.id);
    if (idCompare !== 0) return idCompare;

    return compareAnchorPoints(left, right);
  });
}

function resolveBounds(points: ReadonlyArray<GridPoint>): GridRect {
  if (points.length === 0) {
    throw new Error("Procedural region must contain at least one allowed point");
  }

  let minX = points[0]!.x;
  let maxX = points[0]!.x;
  let minY = points[0]!.y;
  let maxY = points[0]!.y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function expandRect(rect: GridRect): GridPoint[] {
  if (!isPositiveInteger(rect.width) || !isPositiveInteger(rect.height)) {
    throw new Error(
      `Region rect must have positive integer dimensions, got ${rect.width}x${rect.height}`,
    );
  }

  const points: GridPoint[] = [];
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      points.push({ x: rect.x + x, y: rect.y + y });
    }
  }

  return points;
}

function parseAsciiMask(mask: Extract<ProceduralRegionMaskSource, { kind: "ascii" }>): Readonly<{
  allowedPoints: ReadonlyArray<GridPoint>;
  reservedPoints: ReadonlyArray<GridPoint>;
  anchors: ReadonlyArray<ProceduralRegionAnchor>;
}> {
  if (mask.rows.length === 0) {
    throw new Error("ASCII region mask must contain at least one row");
  }

  const width = mask.rows[0]!.length;
  if (width === 0) {
    throw new Error("ASCII region mask rows must not be empty");
  }

  for (const row of mask.rows) {
    if (row.length !== width) {
      throw new Error("ASCII region mask rows must all have the same width");
    }
  }

  const origin = mask.origin ?? { x: 0, y: 0 };
  const legend: Readonly<Record<string, AsciiMaskLegendEntry>> = {
    ...DEFAULT_ASCII_LEGEND,
    ...(mask.legend ?? {}),
  };
  const allowedPoints: GridPoint[] = [];
  const reservedPoints: GridPoint[] = [];
  const anchors: ProceduralRegionAnchor[] = [];

  for (let y = 0; y < mask.rows.length; y += 1) {
    const row = mask.rows[y]!;
    for (let x = 0; x < row.length; x += 1) {
      const symbol = row[x]!;
      const entry = legend[symbol];
      if (!entry) {
        throw new Error(`ASCII region mask contains unknown symbol ${JSON.stringify(symbol)}`);
      }

      const point = {
        x: origin.x + x,
        y: origin.y + y,
      };

      if (entry === "blocked") continue;

      allowedPoints.push(point);
      if (entry === "reserved") {
        reservedPoints.push(point);
        continue;
      }

      if (entry === "allowed") continue;

      anchors.push({
        id: entry.anchorId,
        kind: entry.anchorKind,
        point,
        ...(entry.dir ? { dir: entry.dir } : {}),
      });
      if (entry.reserved) {
        reservedPoints.push(point);
      }
    }
  }

  return {
    allowedPoints: dedupePoints(allowedPoints),
    reservedPoints: dedupePoints(reservedPoints),
    anchors: sortAnchors(anchors),
  };
}

function normalizeMaskPoints(mask: ProceduralRegionMaskSource): Readonly<{
  allowedPoints: ReadonlyArray<GridPoint>;
  reservedPoints: ReadonlyArray<GridPoint>;
  anchors: ReadonlyArray<ProceduralRegionAnchor>;
}> {
  if (mask.kind === "rect") {
    return {
      allowedPoints: dedupePoints(expandRect(mask.rect)),
      reservedPoints: [],
      anchors: [],
    };
  }

  if (mask.kind === "points") {
    return {
      allowedPoints: dedupePoints(mask.points),
      reservedPoints: [],
      anchors: [],
    };
  }

  return parseAsciiMask(mask);
}

function validateAnchors(
  anchors: ReadonlyArray<ProceduralRegionAnchor>,
  allowedPointKeys: ReadonlySet<string>,
  board: Readonly<{
    width: number;
    height: number;
  }>,
): ProceduralRegionAnchor[] {
  const ids = new Set<string>();
  const points = new Set<string>();

  for (const anchor of anchors) {
    if (anchor.id.trim().length === 0) {
      throw new Error("Procedural region anchor ids must not be empty");
    }

    if (ids.has(anchor.id)) {
      throw new Error(`Procedural region anchor id ${JSON.stringify(anchor.id)} is duplicated`);
    }
    ids.add(anchor.id);

    const key = pointKey(anchor.point);
    if (points.has(key)) {
      throw new Error(
        `Procedural region anchors cannot share point (${anchor.point.x},${anchor.point.y})`,
      );
    }
    points.add(key);

    assertPointInBounds(anchor.point, board, `Anchor ${JSON.stringify(anchor.id)} point`);
    if (!allowedPointKeys.has(key)) {
      throw new Error(
        `Anchor ${JSON.stringify(anchor.id)} at (${anchor.point.x},${anchor.point.y}) must lie within the region mask`,
      );
    }
  }

  return sortAnchors(anchors);
}

export function createProceduralRegion(input: ProceduralRegionInput): ProceduralRegion {
  if (!isPositiveInteger(input.board.width) || !isPositiveInteger(input.board.height)) {
    throw new Error(
      `Procedural region board must have positive integer dimensions, got ${input.board.width}x${input.board.height}`,
    );
  }

  const normalizedMask = normalizeMaskPoints(input.mask);
  const explicitReservedPoints = dedupePoints(input.reservedPoints ?? []);
  const reservedPoints = dedupePoints([
    ...normalizedMask.reservedPoints,
    ...explicitReservedPoints,
  ]);
  const anchors = validateAnchors(
    [...normalizedMask.anchors, ...(input.anchors ?? [])],
    new Set(normalizedMask.allowedPoints.map((point) => pointKey(point))),
    input.board,
  );

  for (const point of normalizedMask.allowedPoints) {
    assertPointInBounds(point, input.board, "Allowed region point");
  }

  const allowedPointKeys = new Set(normalizedMask.allowedPoints.map((point) => pointKey(point)));

  for (const point of reservedPoints) {
    assertPointInBounds(point, input.board, "Reserved region point");
    if (!allowedPointKeys.has(pointKey(point))) {
      throw new Error(`Reserved point (${point.x},${point.y}) must lie within the region mask`);
    }
  }

  return {
    ...(input.name ? { name: input.name } : {}),
    board: {
      width: input.board.width,
      height: input.board.height,
    },
    bounds: resolveBounds(normalizedMask.allowedPoints),
    allowedPoints: normalizedMask.allowedPoints,
    reservedPoints,
    anchors,
  };
}

export function regionContainsPoint(region: ProceduralRegion, point: GridPoint): boolean {
  return region.allowedPoints.some(
    (candidate) => candidate.x === point.x && candidate.y === point.y,
  );
}

export function regionReservesPoint(region: ProceduralRegion, point: GridPoint): boolean {
  return region.reservedPoints.some(
    (candidate) => candidate.x === point.x && candidate.y === point.y,
  );
}

export function getProceduralRegionAnchor(
  region: ProceduralRegion,
  anchorId: string,
): ProceduralRegionAnchor | null {
  return region.anchors.find((anchor) => anchor.id === anchorId) ?? null;
}

function renderRegionSymbol(
  region: ProceduralRegion,
  point: GridPoint,
  anchorByPointKey: ReadonlyMap<string, ProceduralRegionAnchor>,
): string {
  const anchor = anchorByPointKey.get(pointKey(point));
  if (anchor) {
    return anchor.kind === "entry" ? "S" : "E";
  }

  if (regionReservesPoint(region, point)) return "R";
  if (regionContainsPoint(region, point)) return ".";
  return "#";
}

export function serializeProceduralRegionDebug(region: ProceduralRegion): string {
  const header = `${region.name ?? "region"} board=${region.board.width}x${region.board.height} bounds=(${region.bounds.x},${region.bounds.y}) ${region.bounds.width}x${region.bounds.height} allowed=${region.allowedPoints.length} reserved=${region.reservedPoints.length} anchors=${region.anchors.length}`;
  const anchorByPointKey = new Map(
    region.anchors.map((anchor) => [pointKey(anchor.point), anchor]),
  );
  const rows: string[] = [];

  for (let y = 0; y < region.bounds.height; y += 1) {
    let row = "";
    for (let x = 0; x < region.bounds.width; x += 1) {
      row += renderRegionSymbol(
        region,
        {
          x: region.bounds.x + x,
          y: region.bounds.y + y,
        },
        anchorByPointKey,
      );
    }
    rows.push(row);
  }

  return [header, ...rows].join("\n");
}

export function serializeIceMazeGraphDebug(graph: ExtractedIceSlideGraph): string {
  const nodeLines = graph.nodes
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => {
      const anchorLabel = node.anchorId ? ` anchor=${node.anchorId}` : "";
      return `${node.id} ${node.role} @ (${node.point.x},${node.point.y})${anchorLabel}`;
    });
  const edgeLines = graph.edges
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (edge) =>
        `${edge.id} ${edge.fromNodeId}->${edge.toNodeId} ${edge.entryDir}/${edge.exitDir} len=${edge.path.length}`,
    );
  const sections = [
    serializeProceduralRegionDebug(graph.region),
    "",
    "nodes:",
    ...nodeLines,
    "",
    "edges:",
    ...edgeLines,
  ];

  if (graph.exitCut) {
    sections.push(
      "",
      "exit-cut:",
      `sockets=${graph.exitCut.socketNodeIds.join(",")}`,
      `boundary=${graph.exitCut.boundaryNodeIds.join(",")}`,
      `exit-region=${graph.exitCut.exitRegionNodeIds.join(",")}`,
      `explorable=${graph.exitCut.explorableNodeIds.join(",")}`,
    );
  }

  return sections.join("\n");
}
