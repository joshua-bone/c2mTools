export type MirrorKind = "horizontal" | "vertical" | "diag-desc" | "diag-asc";

export type MirrorTransformKind =
  | "ROTATE_180"
  | "FLIP_H"
  | "FLIP_V"
  | "FLIP_DIAG_NWSE"
  | "FLIP_DIAG_NESW";

export type MirrorPoint = Readonly<{
  x: number;
  y: number;
}>;

export type MirrorBoardSize = Readonly<{
  width: number;
  height: number;
}>;

export type MirrorAxisState = Readonly<{
  kind: MirrorKind;
  offset: number;
  active: boolean;
}>;

export type MirrorState = Readonly<Record<MirrorKind, MirrorAxisState>>;

export type MirrorVariant = Readonly<{
  point: MirrorPoint;
  transform: MirrorTransformKind | null;
}>;

export type MirrorLineSegment = Readonly<{
  start: MirrorPoint;
  end: MirrorPoint;
}>;

export type MirrorHandleAnchor = Readonly<{
  point: MirrorPoint;
  edge: "top" | "left" | "right";
}>;

const MIRROR_KINDS: ReadonlyArray<MirrorKind> = ["horizontal", "diag-desc", "vertical", "diag-asc"];

const MIRROR_TRANSFORMS: Readonly<Record<MirrorKind, MirrorTransformKind>> = {
  horizontal: "FLIP_V",
  vertical: "FLIP_H",
  "diag-desc": "FLIP_DIAG_NWSE",
  "diag-asc": "FLIP_DIAG_NESW",
};

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function pointsEqual(a: MirrorPoint, b: MirrorPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function uniquePoints(points: ReadonlyArray<MirrorPoint>): MirrorPoint[] {
  const unique: MirrorPoint[] = [];

  for (const point of points) {
    if (unique.some((entry) => pointsEqual(entry, point))) continue;
    unique.push(point);
  }

  return unique;
}

export function isMirrorPairCompatible(a: MirrorKind, b: MirrorKind): boolean {
  return (
    (a === "horizontal" && b === "vertical") ||
    (a === "vertical" && b === "horizontal") ||
    (a === "diag-desc" && b === "diag-asc") ||
    (a === "diag-asc" && b === "diag-desc")
  );
}

export function getMirrorOffsetRange(
  kind: MirrorKind,
  size: MirrorBoardSize,
): Readonly<{ min: number; max: number }> {
  switch (kind) {
    case "vertical":
      return { min: 0, max: size.width };
    case "horizontal":
      return { min: 0, max: size.height };
    case "diag-desc":
      return { min: -(size.width - 1), max: size.height - 1 };
    case "diag-asc":
      return { min: 0, max: size.width + size.height - 2 };
  }
}

export function getDefaultMirrorOffset(kind: MirrorKind, size: MirrorBoardSize): number {
  switch (kind) {
    case "vertical":
      return clampMirrorOffset(kind, Math.floor(size.width / 2), size);
    case "horizontal":
      return clampMirrorOffset(kind, Math.floor(size.height / 2), size);
    case "diag-desc":
      return clampMirrorOffset(kind, Math.round((size.height - size.width) / 2), size);
    case "diag-asc":
      return clampMirrorOffset(kind, Math.round((size.width + size.height - 2) / 2), size);
  }
}

export function clampMirrorOffset(kind: MirrorKind, offset: number, size: MirrorBoardSize): number {
  const range = getMirrorOffsetRange(kind, size);
  return clampInteger(offset, range.min, range.max);
}

export function createDefaultMirrorState(size: MirrorBoardSize): MirrorState {
  return {
    horizontal: {
      kind: "horizontal",
      offset: getDefaultMirrorOffset("horizontal", size),
      active: false,
    },
    "diag-desc": {
      kind: "diag-desc",
      offset: getDefaultMirrorOffset("diag-desc", size),
      active: false,
    },
    vertical: {
      kind: "vertical",
      offset: getDefaultMirrorOffset("vertical", size),
      active: false,
    },
    "diag-asc": {
      kind: "diag-asc",
      offset: getDefaultMirrorOffset("diag-asc", size),
      active: false,
    },
  };
}

export function clampMirrorState(state: MirrorState, size: MirrorBoardSize): MirrorState {
  return {
    horizontal: {
      ...state.horizontal,
      offset: clampMirrorOffset("horizontal", state.horizontal.offset, size),
    },
    "diag-desc": {
      ...state["diag-desc"],
      offset: clampMirrorOffset("diag-desc", state["diag-desc"].offset, size),
    },
    vertical: {
      ...state.vertical,
      offset: clampMirrorOffset("vertical", state.vertical.offset, size),
    },
    "diag-asc": {
      ...state["diag-asc"],
      offset: clampMirrorOffset("diag-asc", state["diag-asc"].offset, size),
    },
  };
}

export function setMirrorOffset(
  state: MirrorState,
  kind: MirrorKind,
  offset: number,
  size: MirrorBoardSize,
): MirrorState {
  return {
    ...state,
    [kind]: {
      ...state[kind],
      offset: clampMirrorOffset(kind, offset, size),
    },
  };
}

export function toggleMirrorActive(state: MirrorState, kind: MirrorKind): MirrorState {
  if (state[kind].active) {
    return {
      ...state,
      [kind]: {
        ...state[kind],
        active: false,
      },
    };
  }

  const nextState: Record<MirrorKind, MirrorAxisState> = {
    horizontal: state.horizontal,
    "diag-desc": state["diag-desc"],
    vertical: state.vertical,
    "diag-asc": state["diag-asc"],
  };

  for (const otherKind of MIRROR_KINDS) {
    if (otherKind === kind) continue;
    if (!state[otherKind].active) continue;
    if (isMirrorPairCompatible(kind, otherKind)) continue;
    nextState[otherKind] = {
      ...state[otherKind],
      active: false,
    };
  }

  nextState[kind] = {
    ...state[kind],
    active: true,
  };

  return nextState;
}

export function getActiveMirrors(state: MirrorState): MirrorAxisState[] {
  return MIRROR_KINDS.map((kind) => state[kind]).filter((mirror) => mirror.active);
}

export function reflectMirrorPoint(
  point: MirrorPoint,
  mirror: MirrorAxisState,
  size: MirrorBoardSize,
): MirrorPoint | null {
  let reflected: MirrorPoint;

  switch (mirror.kind) {
    case "vertical":
      reflected = {
        x: 2 * mirror.offset - point.x - 1,
        y: point.y,
      };
      break;
    case "horizontal":
      reflected = {
        x: point.x,
        y: 2 * mirror.offset - point.y - 1,
      };
      break;
    case "diag-desc":
      reflected = {
        x: point.y - mirror.offset,
        y: point.x + mirror.offset,
      };
      break;
    case "diag-asc":
      reflected = {
        x: mirror.offset - point.y,
        y: mirror.offset - point.x,
      };
      break;
  }

  if (
    reflected.x < 0 ||
    reflected.x >= size.width ||
    reflected.y < 0 ||
    reflected.y >= size.height
  ) {
    return null;
  }

  return reflected;
}

function resolveComposedPoint(
  point: MirrorPoint,
  first: MirrorAxisState,
  second: MirrorAxisState,
  size: MirrorBoardSize,
): MirrorPoint | null {
  let composed: MirrorPoint | null = null;

  if (
    (first.kind === "horizontal" && second.kind === "vertical") ||
    (first.kind === "vertical" && second.kind === "horizontal")
  ) {
    const vertical = first.kind === "vertical" ? first : second;
    const horizontal = first.kind === "horizontal" ? first : second;
    composed = {
      x: 2 * vertical.offset - point.x - 1,
      y: 2 * horizontal.offset - point.y - 1,
    };
  } else if (
    (first.kind === "diag-desc" && second.kind === "diag-asc") ||
    (first.kind === "diag-asc" && second.kind === "diag-desc")
  ) {
    const desc = first.kind === "diag-desc" ? first : second;
    const asc = first.kind === "diag-asc" ? first : second;
    composed = {
      x: asc.offset - point.x - desc.offset,
      y: asc.offset - point.y + desc.offset,
    };
  }

  if (
    !composed ||
    composed.x < 0 ||
    composed.x >= size.width ||
    composed.y < 0 ||
    composed.y >= size.height
  ) {
    return null;
  }

  return composed;
}

export function resolveMirrorVariants(
  point: MirrorPoint,
  state: MirrorState,
  size: MirrorBoardSize,
): MirrorVariant[] {
  const activeMirrors = getActiveMirrors(state);
  const variants: MirrorVariant[] = [{ point, transform: null }];

  for (const mirror of activeMirrors) {
    const reflected = reflectMirrorPoint(point, mirror, size);
    if (!reflected) continue;
    if (variants.some((entry) => pointsEqual(entry.point, reflected))) continue;
    variants.push({
      point: reflected,
      transform: MIRROR_TRANSFORMS[mirror.kind],
    });
  }

  if (
    activeMirrors.length === 2 &&
    isMirrorPairCompatible(activeMirrors[0]!.kind, activeMirrors[1]!.kind)
  ) {
    const composed = resolveComposedPoint(point, activeMirrors[0]!, activeMirrors[1]!, size);
    if (composed && !variants.some((entry) => pointsEqual(entry.point, composed))) {
      variants.push({
        point: composed,
        transform: "ROTATE_180",
      });
    }
  }

  return variants;
}

export function resolveMirroredIndexGroups(
  sourceIndices: ReadonlyArray<number>,
  state: MirrorState,
  size: MirrorBoardSize,
): Readonly<Record<MirrorTransformKind | "SELF", number[]>> {
  const directIndices = Array.from(
    new Set(
      sourceIndices.filter(
        (index) => index >= 0 && index < size.width * size.height && Number.isInteger(index),
      ),
    ),
  );

  const groups: Record<MirrorTransformKind | "SELF", number[]> = {
    SELF: [...directIndices],
    ROTATE_180: [],
    FLIP_H: [],
    FLIP_V: [],
    FLIP_DIAG_NWSE: [],
    FLIP_DIAG_NESW: [],
  };
  const assigned = new Set<number>(directIndices);

  for (const index of directIndices) {
    const point = {
      x: index % size.width,
      y: Math.floor(index / size.width),
    };

    for (const variant of resolveMirrorVariants(point, state, size)) {
      if (variant.transform === null) continue;
      const variantIndex = variant.point.y * size.width + variant.point.x;
      if (assigned.has(variantIndex)) continue;
      assigned.add(variantIndex);
      groups[variant.transform].push(variantIndex);
    }
  }

  return groups;
}

function collectLineIntersections(
  points: ReadonlyArray<MirrorPoint>,
  size: MirrorBoardSize,
): MirrorPoint[] {
  return uniquePoints(
    points.filter(
      (point) => point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height,
    ),
  );
}

export function resolveMirrorLineSegment(
  mirror: MirrorAxisState,
  size: MirrorBoardSize,
): MirrorLineSegment | null {
  switch (mirror.kind) {
    case "vertical":
      return {
        start: { x: mirror.offset, y: 0 },
        end: { x: mirror.offset, y: size.height },
      };
    case "horizontal":
      return {
        start: { x: 0, y: mirror.offset },
        end: { x: size.width, y: mirror.offset },
      };
    case "diag-desc": {
      const points = collectLineIntersections(
        [
          { x: 0, y: mirror.offset },
          { x: size.width, y: size.width + mirror.offset },
          { x: -mirror.offset, y: 0 },
          { x: size.height - mirror.offset, y: size.height },
        ],
        size,
      );
      return points.length >= 2 ? { start: points[0]!, end: points[1]! } : null;
    }
    case "diag-asc": {
      const points = collectLineIntersections(
        [
          { x: 0, y: mirror.offset },
          { x: size.width, y: mirror.offset - size.width },
          { x: mirror.offset, y: 0 },
          { x: mirror.offset - size.height, y: size.height },
        ],
        size,
      );
      return points.length >= 2 ? { start: points[0]!, end: points[1]! } : null;
    }
  }
}

export function resolveMirrorHandleAnchor(
  mirror: MirrorAxisState,
  size: MirrorBoardSize,
): MirrorHandleAnchor | null {
  if (mirror.kind === "vertical") {
    return {
      point: { x: mirror.offset, y: 0 },
      edge: "top",
    };
  }

  if (mirror.kind === "horizontal") {
    return {
      point: { x: 0, y: mirror.offset },
      edge: "left",
    };
  }

  const segment = resolveMirrorLineSegment(mirror, size);
  if (!segment) return null;

  const endpoints = [segment.start, segment.end];

  if (mirror.kind === "diag-desc") {
    const point = endpoints.reduce((best, candidate) =>
      candidate.x + candidate.y < best.x + best.y ? candidate : best,
    );
    return {
      point,
      edge: point.y === 0 ? "top" : "left",
    };
  }

  const point = endpoints.reduce((best, candidate) =>
    size.width - candidate.x + candidate.y < size.width - best.x + best.y ? candidate : best,
  );
  return {
    point,
    edge: point.y === 0 ? "top" : "right",
  };
}

export function resolveMirrorDragOffset(
  kind: MirrorKind,
  clientX: number,
  clientY: number,
  boardRect: Readonly<{ left: number; top: number; width: number; height: number }>,
  size: MirrorBoardSize,
): number {
  const boardX = ((clientX - boardRect.left) / Math.max(1, boardRect.width)) * size.width;
  const boardY = ((clientY - boardRect.top) / Math.max(1, boardRect.height)) * size.height;

  switch (kind) {
    case "vertical":
      return clampMirrorOffset(kind, boardX, size);
    case "horizontal":
      return clampMirrorOffset(kind, boardY, size);
    case "diag-desc":
      return clampMirrorOffset(kind, boardY - boardX, size);
    case "diag-asc":
      return clampMirrorOffset(kind, boardX + boardY - 1, size);
  }
}

export function resolveMirroredHoverPoints(
  point: MirrorPoint | null,
  state: MirrorState,
  size: MirrorBoardSize,
): MirrorPoint[] {
  if (!point) return [];
  return resolveMirrorVariants(point, state, size).map((entry) => entry.point);
}
