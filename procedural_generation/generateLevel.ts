import fs from "node:fs";
import path from "node:path";

import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";

import {
  DEFAULT_ALGORITHM_NAME,
  DEFAULT_SEED,
  generateProceduralLevel,
  listAlgorithmNames,
  summarizeGeneratedLevel,
  type ProceduralAlgorithmName,
} from "./generator.js";

type CliOptions = Readonly<{
  algorithm: ProceduralAlgorithmName;
  seed: number;
  outPath: string;
}>;

function defaultOutputPath(algorithm: ProceduralAlgorithmName, seed: number): string {
  return path.resolve(process.cwd(), "procedural_generation", `${algorithm}-seed-${seed}.c2m`);
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  let algorithm: ProceduralAlgorithmName = DEFAULT_ALGORITHM_NAME;
  let seed: number = DEFAULT_SEED;
  let outPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--algorithm") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --algorithm");
      if (!listAlgorithmNames().includes(next as ProceduralAlgorithmName)) {
        throw new Error(`Unknown algorithm: ${next}`);
      }
      algorithm = next as ProceduralAlgorithmName;
      i++;
      continue;
    }
    if (arg === "--seed") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --seed");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed)) throw new Error(`Invalid seed: ${next}`);
      seed = parsed;
      i++;
      continue;
    }
    if (arg === "--out") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --out");
      outPath = path.resolve(process.cwd(), next);
      i++;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { algorithm, seed, outPath: outPath ?? defaultOutputPath(algorithm, seed) };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const level = generateProceduralLevel({
    algorithm: options.algorithm,
    seed: options.seed,
  });
  const bytes = encodeC2mFromJsonV1(level.doc);
  const decoded = decodeC2mToJsonV1(bytes);
  if (decoded.map?.width !== level.map.width || decoded.map?.height !== level.map.height) {
    throw new Error("Round-trip decode did not preserve the generated map dimensions");
  }

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
  fs.writeFileSync(options.outPath, bytes);

  console.log(`Wrote ${path.relative(process.cwd(), options.outPath)}`);
  console.log(summarizeGeneratedLevel(level));
}

main();
