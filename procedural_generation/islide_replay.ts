import { bytesToHex } from "@noble/hashes/utils.js";
import { md5 } from "@noble/hashes/legacy.js";
import {
  createLevelFromData,
  GameState,
  parseC2M,
  SlidingState,
  SolutionInfoInputProvider,
  type InputProvider,
  type KeyInputs,
  type LevelState,
} from "@notcc/logic";
import { Buffer } from "buffer";

import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  type Base64Blob,
  type C2mJsonV1,
} from "../src/c2m/c2mJsonV1.js";
import { flattenCellLayers } from "../src/c2m/cellStack.js";
import type { Dir, MapJson } from "../src/c2m/mapCodec.js";
import type { GridPoint } from "./ice_maze.js";
import type { ISlideLayout } from "./islide_generator.js";

const GENERATED_REPLAY_POLICY = "generated-strict" as const;
const C2M_REPLAY_HEADER = Object.freeze([0, 0, 0, 3]);
const C2M_REPLAY_TERMINATOR = Object.freeze([0, 0xff]);
const MAX_C2M_RUN_LENGTH = 0xfc;
const MAX_PACKED_SECTION_UNPACKED_LENGTH = 0xffff;
const MAX_SIMULATION_SUBTICKS = 3_000_000;
const MAX_SUBTICKS_WITHOUT_ROUTE_PROGRESS = 12_000;
const MAX_SUBTICKS_AFTER_ROUTE = 600;
const FINITE_NEUTRAL_TAIL_SUBTICKS = 60;

const EMPTY_INPUT: KeyInputs = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  drop: false,
  rotateInv: false,
  switchPlayable: false,
});

const INPUT_BY_DIR: Readonly<Record<Dir, KeyInputs>> = Object.freeze({
  N: Object.freeze({ ...EMPTY_INPUT, up: true }),
  E: Object.freeze({ ...EMPTY_INPUT, right: true }),
  S: Object.freeze({ ...EMPTY_INPUT, down: true }),
  W: Object.freeze({ ...EMPTY_INPUT, left: true }),
});

export type ISlideReplayValidationPolicy = typeof GENERATED_REPLAY_POLICY;

export type ISlideReplayValidationOptions = Readonly<{
  policy: ISlideReplayValidationPolicy;
  expectedReplayHashHex?: string;
}>;

export type ISlideReplayEngineOutcome =
  | "won"
  | "playing"
  | "death"
  | "timeout"
  | "not-run"
  | "error";

export type ISlideReplayValidation = Readonly<{
  ok: boolean;
  policy: ISlideReplayValidationPolicy;
  containerValid: boolean;
  replayHashValid: boolean;
  verifiedFlagSet: boolean;
  engineOutcome: ISlideReplayEngineOutcome;
  postInputTicks: number;
  chipsLeft: number;
  width: number;
  height: number;
  replayFrames: number;
  subticksSimulated: number;
  errors: ReadonlyArray<string>;
}>;

export type ISlideC2mArtifact = Readonly<{
  fileName: "i-slide-99.c2m";
  doc: C2mJsonV1;
  c2mBytes: Uint8Array;
  replayBytes: Uint8Array;
  replayHashHex: string;
  replayFrames: number;
  validation: ISlideReplayValidation;
}>;

type ISlideGraphEdge = ISlideLayout["graph"]["edges"][number];
type ISlideGraphNode = ISlideLayout["graph"]["nodes"][number];

type ReplayInspection = Readonly<{
  valid: boolean;
  frameCount: number;
  errors: ReadonlyArray<string>;
}>;

type MapEntityCounts = Readonly<{
  chips: number;
  exits: number;
  players: number;
  sockets: number;
}>;

type RouteStep = Readonly<{
  edgeId: string;
  from: GridPoint;
  input: KeyInputs;
  to: GridPoint;
}>;

class WaypointInputProvider implements InputProvider {
  private nextStepIndex = 0;
  private cachedInput = EMPTY_INPUT;
  private cachedTick = -1;

  public constructor(private readonly steps: ReadonlyArray<RouteStep>) {}

  public get waypointIndex(): number {
    return this.nextStepIndex;
  }

  public get routeComplete(): boolean {
    return this.nextStepIndex >= this.steps.length;
  }

  public getInput(level: LevelState): KeyInputs {
    if (this.cachedTick === level.currentTick) return this.cachedInput;
    this.cachedTick = level.currentTick;
    this.cachedInput = EMPTY_INPUT;

    const player = level.selectedPlayable;
    if (!player || player.cooldown !== 0 || player.slidingState !== SlidingState.NONE) {
      return this.cachedInput;
    }

    const currentPoint = point(player.tile.x, player.tile.y);
    const currentStep = this.steps[this.nextStepIndex];
    if (currentStep && pointsEqual(currentPoint, currentStep.to)) {
      this.nextStepIndex += 1;
    }

    const nextStep = this.steps[this.nextStepIndex];
    if (!nextStep) return this.cachedInput;
    if (!pointsEqual(currentPoint, nextStep.from)) {
      return this.cachedInput;
    }

    this.cachedInput = nextStep.input;
    return this.cachedInput;
  }

  public outOfInput(): boolean {
    return false;
  }

  public setupLevel(level: LevelState): void {
    level.randomForceFloorDirection = 0;
    level.blobPrngValue = 0;
  }
}

export function buildISlideC2mArtifact(layout: ISlideLayout): ISlideC2mArtifact {
  assertISlideMapBounds(layout.map);
  const routeSteps = buildSolutionRouteSteps(layout);
  const bareDoc = makeISlideDoc(layout.map);
  const bareBytes = encodeC2mFromJsonV1(bareDoc);
  const replayFrames = driveSolutionAndRecordFrames(bareBytes, routeSteps);

  replayFrames.push(...Array<number>(FINITE_NEUTRAL_TAIL_SUBTICKS).fill(0));
  const replayBytes = encodeC2mReplay(replayFrames);
  if (replayBytes.length > MAX_PACKED_SECTION_UNPACKED_LENGTH) {
    throw new Error(
      `I SLIDE replay is ${replayBytes.length} bytes; C2M PRPL supports at most ` +
        `${MAX_PACKED_SECTION_UNPACKED_LENGTH} unpacked bytes.`,
    );
  }

  const replayHash = md5(replayBytes);
  const replayHashHex = bytesToHex(replayHash);
  const doc = makeISlideDoc(layout.map, {
    replayBytes,
    replayHash,
  });
  const c2mBytes = encodeC2mFromJsonV1(doc);
  const validation = validateISlideC2m(c2mBytes, {
    expectedReplayHashHex: replayHashHex,
    policy: GENERATED_REPLAY_POLICY,
  });

  if (!validation.ok) {
    throw new Error(
      `Generated I SLIDE replay failed strict validation: ${validation.errors.join("; ")}`,
    );
  }

  return {
    fileName: "i-slide-99.c2m",
    doc,
    c2mBytes,
    replayBytes,
    replayHashHex,
    replayFrames: replayFrames.length,
    validation,
  };
}

export function validateISlideC2m(
  c2mBytes: Uint8Array,
  options: ISlideReplayValidationOptions,
): ISlideReplayValidation {
  const errors: string[] = [];
  let doc: C2mJsonV1 | undefined;

  if (options.policy !== GENERATED_REPLAY_POLICY) {
    errors.push(`Unsupported replay validation policy: ${String(options.policy)}`);
  }

  try {
    doc = decodeC2mToJsonV1(c2mBytes);
  } catch (error: unknown) {
    errors.push(`C2M decode failed: ${asErrorMessage(error)}`);
  }

  const width = doc?.map?.width ?? 0;
  const height = doc?.map?.height ?? 0;
  const replayBytes = doc?.replay ? fromBase64(doc.replay) : undefined;
  const replayInspection = replayBytes
    ? inspectGeneratedReplay(replayBytes)
    : { valid: false, frameCount: 0, errors: ["C2M has no replay."] };
  errors.push(...replayInspection.errors);

  const entityCounts = doc?.map ? countMapEntities(doc.map) : undefined;
  const dimensionsValid = width === 99 && height === 99;
  if (!dimensionsValid) errors.push(`Expected a 99x99 map, received ${width}x${height}.`);
  if (!doc?.map) {
    errors.push("C2M has no map.");
  } else {
    if (entityCounts?.players !== 1) {
      errors.push(`Expected exactly one player, received ${entityCounts?.players ?? 0}.`);
    }
    if (entityCounts?.sockets !== 1) {
      errors.push(`Expected exactly one chip socket, received ${entityCounts?.sockets ?? 0}.`);
    }
    if (entityCounts?.exits !== 1) {
      errors.push(`Expected exactly one exit, received ${entityCounts?.exits ?? 0}.`);
    }
    if ((entityCounts?.chips ?? 0) <= 0) {
      errors.push("Expected at least one required chip.");
    }
  }

  const verifiedFlagSet = doc?.options?.verifiedReplay === 1;
  if (!verifiedFlagSet) errors.push("OPTN does not mark the replay as verified.");

  const actualReplayHashHex = replayBytes ? bytesToHex(md5(replayBytes)) : undefined;
  const embeddedReplayHashHex = doc?.options?.replayHash
    ? bytesToHex(fromBase64(doc.options.replayHash))
    : undefined;
  const expectedReplayHashHex = options.expectedReplayHashHex?.toLowerCase();
  const replayHashValid =
    actualReplayHashHex !== undefined &&
    embeddedReplayHashHex === actualReplayHashHex &&
    (expectedReplayHashHex === undefined || expectedReplayHashHex === actualReplayHashHex);

  if (!replayHashValid) {
    errors.push("Replay MD5 does not match the embedded or expected replay hash.");
  }

  const containerValid =
    doc !== undefined &&
    doc.map !== undefined &&
    dimensionsValid &&
    replayInspection.valid &&
    entityCounts?.players === 1 &&
    entityCounts.sockets === 1 &&
    entityCounts.exits === 1 &&
    entityCounts.chips > 0;

  let engineOutcome: ISlideReplayEngineOutcome = "not-run";
  let chipsLeft = -1;
  let subticksSimulated = 0;

  if (doc && replayBytes && replayInspection.valid) {
    try {
      const levelData = parseC2M(toExactArrayBuffer(c2mBytes));
      if (!levelData.associatedSolution?.steps) {
        throw new Error("NotCC did not find the embedded replay.");
      }

      const level = createLevelFromData(levelData);
      const inputProvider = new SolutionInfoInputProvider(levelData.associatedSolution);
      inputProvider.bonusTicks = 0;
      level.inputProvider = inputProvider;

      const strictSubtickBound = Math.min(MAX_SIMULATION_SUBTICKS, replayInspection.frameCount + 3);
      while (
        level.gameState === GameState.PLAYING &&
        !inputProvider.outOfInput(level) &&
        subticksSimulated < strictSubtickBound
      ) {
        level.tick();
        subticksSimulated += 1;
      }

      engineOutcome = gameStateToOutcome(level.gameState);
      chipsLeft = level.chipsLeft;
      if (engineOutcome !== "won") {
        errors.push("NotCC did not reach the exit within the finite replay input.");
      }
      if (chipsLeft !== 0) {
        errors.push(`NotCC finished strict validation with ${chipsLeft} chips left.`);
      }
    } catch (error: unknown) {
      engineOutcome = "error";
      errors.push(`NotCC validation failed: ${asErrorMessage(error)}`);
    }
  }

  const ok =
    containerValid &&
    replayHashValid &&
    verifiedFlagSet &&
    engineOutcome === "won" &&
    chipsLeft === 0;

  return {
    ok,
    policy: GENERATED_REPLAY_POLICY,
    containerValid,
    replayHashValid,
    verifiedFlagSet,
    engineOutcome,
    postInputTicks: 0,
    chipsLeft,
    width,
    height,
    replayFrames: replayInspection.frameCount,
    subticksSimulated,
    errors,
  };
}

function makeISlideDoc(
  map: MapJson,
  replay?: Readonly<{
    replayBytes: Uint8Array;
    replayHash: Uint8Array;
  }>,
): C2mJsonV1 {
  return parseC2mJsonV1({
    schema: "c2mTools.c2m.json.v1",
    fileVersion: "7",
    title: "I SLIDE 99",
    author: "Joshua Bone",
    editorVersion: "c2mTools deterministic generator",
    clue: "Collect every chip, open the socket, and follow the ice routes to the exit.",
    options: {
      time: 0,
      editorWindow: 0,
      verifiedReplay: replay ? 1 : 0,
      hideMap: 0,
      readOnlyOption: 0,
      ...(replay ? { replayHash: toBase64(replay.replayHash) } : {}),
      hideLogic: 0,
      cc1Boots: 0,
      blobPatterns: 1,
    },
    map,
    ...(replay ? { replay: toBase64(replay.replayBytes) } : {}),
  });
}

function buildSolutionRouteSteps(layout: ISlideLayout): RouteStep[] {
  const nodesById = new Map(layout.graph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(layout.graph.edges.map((edge) => [edge.id, edge]));
  const { edgeIds, nodeIds } = layout.solution;

  if (nodeIds.length !== edgeIds.length + 1) {
    throw new Error(
      `I SLIDE solution has ${nodeIds.length} nodes but ${edgeIds.length} edges; ` +
        "a route must have exactly one more node than edge.",
    );
  }
  if (edgeIds.length === 0) throw new Error("I SLIDE solution route is empty.");

  const routeSteps: RouteStep[] = [];
  for (let index = 0; index < edgeIds.length; index += 1) {
    const edgeId = edgeIds[index]!;
    const fromNodeId = nodeIds[index]!;
    const toNodeId = nodeIds[index + 1]!;
    const edge = edgesById.get(edgeId);
    const fromNode = nodesById.get(fromNodeId);
    const toNode = nodesById.get(toNodeId);

    if (!edge) throw new Error(`I SLIDE solution references unknown edge "${edgeId}".`);
    if (!fromNode) throw new Error(`I SLIDE solution references unknown node "${fromNodeId}".`);
    if (!toNode) throw new Error(`I SLIDE solution references unknown node "${toNodeId}".`);

    routeSteps.push(makeRouteStep(edge, fromNode, toNode));
  }

  if (routeSteps.length > MAX_SIMULATION_SUBTICKS) {
    throw new Error(`I SLIDE solution expands to too many route steps: ${routeSteps.length}.`);
  }
  return routeSteps;
}

function makeRouteStep(
  edge: ISlideGraphEdge,
  routeFrom: ISlideGraphNode,
  routeTo: ISlideGraphNode,
): RouteStep {
  const traversesForward = edge.fromNodeId === routeFrom.id && edge.toNodeId === routeTo.id;
  const traversesReverse = edge.toNodeId === routeFrom.id && edge.fromNodeId === routeTo.id;
  if (!traversesForward && !traversesReverse) {
    throw new Error(
      `I SLIDE edge "${edge.id}" does not connect route nodes ` +
        `"${routeFrom.id}" and "${routeTo.id}".`,
    );
  }

  return {
    edgeId: edge.id,
    from: routeFrom.point,
    input: INPUT_BY_DIR[traversesForward ? edge.entryDir : oppositeDirection(edge.exitDir)],
    to: routeTo.point,
  };
}

function driveSolutionAndRecordFrames(
  bareC2mBytes: Uint8Array,
  routeSteps: ReadonlyArray<RouteStep>,
): number[] {
  const levelData = parseC2M(toExactArrayBuffer(bareC2mBytes));
  const level = createLevelFromData(levelData);
  const inputProvider = new WaypointInputProvider(routeSteps);
  level.inputProvider = inputProvider;

  const replayFrames: number[] = [];
  let lastWaypointIndex = inputProvider.waypointIndex;
  let subticksWithoutProgress = 0;
  let subticksAfterRoute = 0;

  while (level.gameState === GameState.PLAYING) {
    if (replayFrames.length >= MAX_SIMULATION_SUBTICKS) {
      throw new Error(
        `I SLIDE replay exceeded the ${MAX_SIMULATION_SUBTICKS}-subtick safety bound.`,
      );
    }

    level.tick();
    replayFrames.push(keyInputsToC2mMask(level.gameInput));

    if (inputProvider.waypointIndex !== lastWaypointIndex) {
      lastWaypointIndex = inputProvider.waypointIndex;
      subticksWithoutProgress = 0;
    } else if (inputProvider.routeComplete) {
      subticksAfterRoute += 1;
      if (subticksAfterRoute > MAX_SUBTICKS_AFTER_ROUTE) {
        throw new Error("I SLIDE reached the final waypoint but did not enter the exit.");
      }
    } else {
      subticksWithoutProgress += 1;
      if (subticksWithoutProgress > MAX_SUBTICKS_WITHOUT_ROUTE_PROGRESS) {
        const nextStep = routeSteps[inputProvider.waypointIndex];
        const player = level.selectedPlayable;
        const playerPosition = player ? ` at (${player.tile.x},${player.tile.y})` : "";
        throw new Error(
          `I SLIDE replay driver stopped making route progress${playerPosition}` +
            (nextStep
              ? ` on edge "${nextStep.edgeId}" before (${nextStep.to.x},${nextStep.to.y}).`
              : "."),
        );
      }
    }
  }

  if (level.gameState !== GameState.WON) {
    throw new Error(
      `I SLIDE replay ended with engine state ${gameStateToOutcome(level.gameState)}.`,
    );
  }
  if (level.chipsLeft !== 0) {
    throw new Error(`I SLIDE replay reached the exit with ${level.chipsLeft} chips left.`);
  }
  return replayFrames;
}

function encodeC2mReplay(frames: ReadonlyArray<number>): Uint8Array {
  if (frames.length === 0) throw new Error("Cannot encode an empty I SLIDE replay.");

  const bytes: number[] = [...C2M_REPLAY_HEADER];
  let runInput = frames[0]!;
  let runLength = 0;

  const flushRun = () => {
    while (runLength > 0) {
      const chunkLength = Math.min(runLength, MAX_C2M_RUN_LENGTH);
      bytes.push(runInput, chunkLength);
      runLength -= chunkLength;
    }
  };

  for (const input of frames) {
    assertC2mInputMask(input);
    if (input !== runInput) {
      flushRun();
      runInput = input;
    }
    runLength += 1;
    if (runLength === MAX_C2M_RUN_LENGTH) flushRun();
  }
  flushRun();
  bytes.push(...C2M_REPLAY_TERMINATOR);

  return Uint8Array.from(bytes);
}

function inspectGeneratedReplay(replayBytes: Uint8Array): ReplayInspection {
  const errors: string[] = [];
  let frameCount = 0;
  let lastFiniteInput: number | undefined;
  let lastFiniteDuration: number | undefined;
  let foundTerminator = false;

  if (replayBytes.length < 8) errors.push("Replay is too short for a finite run and terminator.");
  for (let index = 0; index < C2M_REPLAY_HEADER.length; index += 1) {
    if (replayBytes[index] !== C2M_REPLAY_HEADER[index]) {
      errors.push("Generated replay does not use the deterministic I SLIDE replay header.");
      break;
    }
  }
  if ((replayBytes.length - C2M_REPLAY_HEADER.length) % 2 !== 0) {
    errors.push("Generated replay contains an unpaired final input.");
  }

  for (let offset = C2M_REPLAY_HEADER.length; offset + 1 < replayBytes.length; offset += 2) {
    const input = replayBytes[offset]!;
    const duration = replayBytes[offset + 1]!;
    if (duration === 0xff) {
      foundTerminator = input === 0 && offset + 2 === replayBytes.length;
      if (!foundTerminator) errors.push("Replay terminator must be the final 00 FF pair.");
      break;
    }
    if (duration === 0 || duration > MAX_C2M_RUN_LENGTH) {
      errors.push(`Replay run at byte ${offset} has invalid duration ${duration}.`);
    }
    try {
      assertC2mInputMask(input);
    } catch (error: unknown) {
      errors.push(asErrorMessage(error));
    }
    frameCount += duration;
    lastFiniteInput = input;
    lastFiniteDuration = duration;
  }

  if (!foundTerminator) errors.push("Generated replay has no final 00 FF terminator.");
  if (lastFiniteInput !== 0 || !lastFiniteDuration) {
    errors.push("Generated replay must end with a non-empty finite neutral input run.");
  }
  if (frameCount > MAX_SIMULATION_SUBTICKS) {
    errors.push(`Replay exceeds the ${MAX_SIMULATION_SUBTICKS}-subtick validation bound.`);
  }

  return {
    valid: errors.length === 0,
    frameCount,
    errors,
  };
}

function countMapEntities(map: MapJson): MapEntityCounts {
  let chips = 0;
  let exits = 0;
  let players = 0;
  let sockets = 0;

  for (const tile of map.tiles) {
    const layers = flattenCellLayers(tile);
    const names = [layers.terrain.tile, layers.item?.tile, layers.mob?.tile];
    if (names.includes("IC_CHIP")) chips += 1;
    if (names.includes("EXIT")) exits += 1;
    if (names.includes("CHIP")) players += 1;
    if (names.includes("CHIP_SOCKET")) sockets += 1;
  }
  return { chips, exits, players, sockets };
}

function assertISlideMapBounds(map: MapJson): void {
  if (map.width !== 99 || map.height !== 99) {
    throw new Error(`I SLIDE artifact requires a 99x99 map, received ${map.width}x${map.height}.`);
  }
  if (map.tiles.length !== map.width * map.height) {
    throw new Error(
      `I SLIDE map has ${map.tiles.length} cells; expected ${map.width * map.height}.`,
    );
  }
}

function keyInputsToC2mMask(input: KeyInputs): number {
  return (
    (input.drop ? 0x01 : 0) |
    (input.down ? 0x02 : 0) |
    (input.left ? 0x04 : 0) |
    (input.right ? 0x08 : 0) |
    (input.up ? 0x10 : 0) |
    (input.switchPlayable ? 0x20 : 0) |
    (input.rotateInv ? 0x40 : 0)
  );
}

function assertC2mInputMask(input: number): void {
  if (!Number.isInteger(input) || input < 0 || input > 0xff) {
    throw new Error(`Invalid C2M input mask: ${input}.`);
  }
  if ((input & ~0x1e) !== 0) {
    throw new Error(
      `Generated replay uses unsupported non-cardinal input mask 0x${input.toString(16)}.`,
    );
  }
  const directions = [0x02, 0x04, 0x08, 0x10].filter((bit) => (input & bit) !== 0);
  if (directions.length > 1) {
    throw new Error(
      `Generated replay uses simultaneous directions in mask 0x${input.toString(16)}.`,
    );
  }
}

function oppositeDirection(dir: Dir): Dir {
  switch (dir) {
    case "N":
      return "S";
    case "E":
      return "W";
    case "S":
      return "N";
    case "W":
      return "E";
  }
}

function gameStateToOutcome(gameState: GameState): ISlideReplayEngineOutcome {
  switch (gameState) {
    case GameState.WON:
      return "won";
    case GameState.DEATH:
      return "death";
    case GameState.TIMEOUT:
      return "timeout";
    case GameState.PLAYING:
      return "playing";
  }
}

function point(x: number, y: number): GridPoint {
  return { x, y };
}

function pointsEqual(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function toBase64(bytes: Uint8Array): Base64Blob {
  return {
    encoding: "base64",
    dataBase64: Buffer.from(bytes).toString("base64"),
  };
}

function fromBase64(blob: Base64Blob): Uint8Array {
  return Uint8Array.from(Buffer.from(blob.dataBase64, "base64"));
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
