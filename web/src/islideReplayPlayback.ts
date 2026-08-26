import {
  createLevelFromData,
  Direction,
  GameState,
  parseC2M,
  SolutionInfoInputProvider,
  type Actor,
  type LevelState,
} from "@notcc/logic";

import { decodeC2mToJsonV1 } from "../../src/c2m/c2mJsonV1.js";
import {
  buildCellFromLayers,
  flattenCellLayers,
  type C2mCellLayers,
} from "../../src/c2m/cellStack.js";
import type { Dir, MapJson, TileSpecJson } from "../../src/c2m/mapCodec.js";

export type ISlideReplayOutcome = "playing" | "won" | "death" | "timeout" | "exhausted";

export type ISlideReplayPlayer = Readonly<{
  x: number;
  y: number;
  visualX: number;
  visualY: number;
  direction: Dir;
}>;

export type ISlideReplaySnapshot = Readonly<{
  source: "notcc-engine";
  map: MapJson;
  changedIndices: ReadonlyArray<number>;
  elapsedSubticks: number;
  totalSubticks: number;
  engineTick: number;
  engineSubtick: 0 | 1 | 2;
  chipsLeft: number;
  outcome: ISlideReplayOutcome;
  player?: ISlideReplayPlayer;
}>;

export type ISlideReplayPlayback = Readonly<{
  snapshot: () => ISlideReplaySnapshot;
  advance: (maxSubticks: number) => ISlideReplaySnapshot;
  reset: () => ISlideReplaySnapshot;
}>;

type EngineSession = Readonly<{
  level: LevelState;
  inputProvider: SolutionInfoInputProvider;
}>;

const PLAYER_TILE_NAME = "CHIP";
const CHIP_TILE_NAME = "IC_CHIP";
const SOCKET_TILE_NAME = "CHIP_SOCKET";

export function createISlideReplayPlayback(
  c2mBytes: Uint8Array,
  totalSubticks: number,
): ISlideReplayPlayback {
  if (!Number.isSafeInteger(totalSubticks) || totalSubticks <= 0) {
    throw new Error(`Replay duration must be a positive safe integer; received ${totalSubticks}.`);
  }

  const decoded = decodeC2mToJsonV1(c2mBytes);
  if (!decoded.map) throw new Error("I SLIDE replay has no map to render.");
  const sourceMap = decoded.map;
  const dynamicSourceIndices = findDynamicSourceIndices(sourceMap);
  const allIndices = Array.from({ length: sourceMap.tiles.length }, (_, index) => index);

  let session = createEngineSession(c2mBytes);
  let elapsedSubticks = 0;
  let renderedTiles = [...sourceMap.tiles];
  let previousPlayerIndex: number | undefined;
  let currentSnapshot = buildSnapshot(allIndices);

  function buildSnapshot(forcedChangedIndices?: ReadonlyArray<number>): ISlideReplaySnapshot {
    const playerActor = findExistingPlayer(session.level);
    const playerIndex = playerActor
      ? playerActor.tile.y * sourceMap.width + playerActor.tile.x
      : undefined;
    const candidateIndices = new Set(dynamicSourceIndices);
    if (previousPlayerIndex !== undefined) candidateIndices.add(previousPlayerIndex);
    if (playerIndex !== undefined) candidateIndices.add(playerIndex);

    const nextTiles = [...renderedTiles];
    const changedIndices: number[] = [];
    for (const index of candidateIndices) {
      const nextTile = buildEngineCell(sourceMap, session.level, index, playerIndex);
      if (JSON.stringify(nextTile) === JSON.stringify(renderedTiles[index])) continue;
      nextTiles[index] = nextTile;
      changedIndices.push(index);
    }
    renderedTiles = nextTiles;
    previousPlayerIndex = playerIndex;

    const player = playerActor ? snapshotPlayer(playerActor) : undefined;
    return {
      source: "notcc-engine",
      map: { ...sourceMap, tiles: renderedTiles },
      changedIndices: forcedChangedIndices ?? changedIndices,
      elapsedSubticks,
      totalSubticks,
      engineTick: session.level.currentTick,
      engineSubtick: session.level.subtick,
      chipsLeft: session.level.chipsLeft,
      outcome: engineOutcome(session, elapsedSubticks, totalSubticks),
      ...(player ? { player } : {}),
    };
  }

  function snapshot(): ISlideReplaySnapshot {
    return currentSnapshot;
  }

  function advance(maxSubticks: number): ISlideReplaySnapshot {
    if (!Number.isFinite(maxSubticks) || maxSubticks <= 0) return currentSnapshot;
    const boundedSubticks = Math.min(
      Math.floor(maxSubticks),
      Math.max(0, totalSubticks - elapsedSubticks),
    );

    for (let index = 0; index < boundedSubticks; index += 1) {
      if (engineOutcome(session, elapsedSubticks, totalSubticks) !== "playing") break;
      session.level.tick();
      elapsedSubticks += 1;
    }
    currentSnapshot = buildSnapshot();
    return currentSnapshot;
  }

  function reset(): ISlideReplaySnapshot {
    session = createEngineSession(c2mBytes);
    elapsedSubticks = 0;
    renderedTiles = [...sourceMap.tiles];
    previousPlayerIndex = undefined;
    currentSnapshot = buildSnapshot(allIndices);
    return currentSnapshot;
  }

  return { snapshot, advance, reset };
}

function createEngineSession(c2mBytes: Uint8Array): EngineSession {
  const levelData = parseC2M(toExactArrayBuffer(c2mBytes));
  if (!levelData.associatedSolution?.steps) {
    throw new Error("NotCC did not find the packaged I SLIDE replay.");
  }
  const level = createLevelFromData(levelData);
  const inputProvider = new SolutionInfoInputProvider(levelData.associatedSolution);
  inputProvider.bonusTicks = 0;
  level.inputProvider = inputProvider;
  return { level, inputProvider };
}

function findDynamicSourceIndices(map: MapJson): ReadonlyArray<number> {
  const indices: number[] = [];
  for (const [index, tile] of map.tiles.entries()) {
    const layers = flattenCellLayers(tile);
    if (
      layers.mob?.tile === PLAYER_TILE_NAME ||
      layers.item?.tile === CHIP_TILE_NAME ||
      layers.terrain.tile === SOCKET_TILE_NAME
    ) {
      indices.push(index);
    }
  }
  return indices;
}

function buildEngineCell(
  sourceMap: MapJson,
  level: LevelState,
  index: number,
  playerIndex: number | undefined,
): TileSpecJson {
  const sourceTile = sourceMap.tiles[index] ?? "FLOOR";
  const sourceLayers = flattenCellLayers(sourceTile);
  const x = index % sourceMap.width;
  const y = Math.floor(index / sourceMap.width);
  const engineActors = Array.from(level.field[x]?.[y]?.allActors ?? []).filter(
    (actor) => actor.exists,
  );
  const actorIds = new Set(engineActors.map((actor) => actor.id));
  const socketIsOpen = sourceLayers.terrain.tile === SOCKET_TILE_NAME && !actorIds.has("echipGate");
  const itemExists = sourceLayers.item?.tile !== CHIP_TILE_NAME || actorIds.has("echip");
  const sourceMobIsPlayer = sourceLayers.mob?.tile === PLAYER_TILE_NAME;
  const direction = playerIndex === index ? findExistingPlayer(level)?.direction : undefined;

  const layers: C2mCellLayers = {
    terrain: socketIsOpen ? { tile: "FLOOR" } : sourceLayers.terrain,
    ...(sourceLayers.item && itemExists ? { item: sourceLayers.item } : {}),
    ...(sourceLayers.mob && !sourceMobIsPlayer ? { mob: sourceLayers.mob } : {}),
    ...(sourceLayers.noSign ? { noSign: sourceLayers.noSign } : {}),
    ...(sourceLayers.thinWalls ? { thinWalls: sourceLayers.thinWalls } : {}),
    ...(direction !== undefined
      ? { mob: { tile: PLAYER_TILE_NAME, dir: directionFromNotcc(direction) } }
      : {}),
  };
  return buildCellFromLayers(layers);
}

function findExistingPlayer(level: LevelState): Actor | undefined {
  const selected = level.selectedPlayable;
  if (selected?.exists && selected.id === "chip") return selected;
  return level.actors.find((actor) => actor.exists && actor.id === "chip");
}

function snapshotPlayer(player: Actor): ISlideReplayPlayer {
  const [visualX, visualY] = player.getVisualPosition();
  return {
    x: player.tile.x,
    y: player.tile.y,
    visualX,
    visualY,
    direction: directionFromNotcc(player.direction),
  };
}

function directionFromNotcc(direction: Direction): Dir {
  switch (direction) {
    case Direction.UP:
      return "N";
    case Direction.RIGHT:
      return "E";
    case Direction.DOWN:
      return "S";
    case Direction.LEFT:
      return "W";
  }
}

function engineOutcome(
  session: EngineSession,
  elapsedSubticks: number,
  totalSubticks: number,
): ISlideReplayOutcome {
  switch (session.level.gameState) {
    case GameState.WON:
      return "won";
    case GameState.DEATH:
      return "death";
    case GameState.TIMEOUT:
      return "timeout";
    case GameState.PLAYING:
      return elapsedSubticks >= totalSubticks || session.inputProvider.outOfInput(session.level)
        ? "exhausted"
        : "playing";
  }
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
