import fs from "node:fs";
import path from "node:path";

import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";

import { DEFAULT_SEED, generateProceduralLevel, summarizeGeneratedLevel } from "./generator.js";

type CliOptions = Readonly<{
  seed: number;
  outPath: string;
}>;

function defaultOutputPath(seed: number): string {
  return path.resolve(
    process.cwd(),
    "procedural_generation",
    `procedural-stack-level-seed-${seed}.c2m`,
  );
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  let seed = DEFAULT_SEED;
  let outPath = defaultOutputPath(seed);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --seed");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed)) throw new Error(`Invalid seed: ${next}`);
      seed = parsed;
      outPath = defaultOutputPath(seed);
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

  return { seed, outPath };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const level = generateProceduralLevel(options.seed);
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
