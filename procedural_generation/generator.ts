import {
  ALGORITHM_NAME as WHOPPER_SWAPPER_NAME,
  DEFAULT_SEED as WHOPPER_SWAPPER_DEFAULT_SEED,
  generateProceduralLevel as generateWhopperSwapperLevel,
  summarizeGeneratedLevel as summarizeWhopperSwapperLevel,
  type GeneratedLevel as WhopperSwapperGeneratedLevel,
} from "./algorithms/whopper_swapper.js";

const PROCEDURAL_GENERATORS = {
  [WHOPPER_SWAPPER_NAME]: {
    DEFAULT_SEED: WHOPPER_SWAPPER_DEFAULT_SEED,
    generateProceduralLevel: generateWhopperSwapperLevel,
    summarizeGeneratedLevel: summarizeWhopperSwapperLevel,
  },
} as const;

export type ProceduralAlgorithmName = keyof typeof PROCEDURAL_GENERATORS;
export type GeneratedLevel = WhopperSwapperGeneratedLevel;

export const DEFAULT_ALGORITHM_NAME: ProceduralAlgorithmName = WHOPPER_SWAPPER_NAME;
export const DEFAULT_SEED = PROCEDURAL_GENERATORS[DEFAULT_ALGORITHM_NAME].DEFAULT_SEED;

export function listAlgorithmNames(): ProceduralAlgorithmName[] {
  return Object.keys(PROCEDURAL_GENERATORS) as ProceduralAlgorithmName[];
}

export function generateProceduralLevel(
  options: Readonly<{
    algorithm?: ProceduralAlgorithmName;
    seed?: number;
  }> = {},
): GeneratedLevel {
  const algorithmName = options.algorithm ?? DEFAULT_ALGORITHM_NAME;
  const algorithm = PROCEDURAL_GENERATORS[algorithmName];
  if (!algorithm) {
    throw new Error(`Unknown procedural generation algorithm: ${algorithmName}`);
  }

  return algorithm.generateProceduralLevel(options.seed ?? algorithm.DEFAULT_SEED);
}

export function summarizeGeneratedLevel(level: GeneratedLevel): string {
  const algorithm = PROCEDURAL_GENERATORS[level.algorithmName];
  if (!algorithm) {
    throw new Error(`Unknown procedural generation algorithm: ${level.algorithmName}`);
  }

  return algorithm.summarizeGeneratedLevel(level);
}
