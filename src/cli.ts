// src/cli.ts
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";

import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  stringifyC2mJsonV1,
} from "./c2m/c2mJsonV1.js";

import { runTransformTool } from "./c2m/transformTool.js";
import { runRenderTool } from "./c2m/render/renderTool.js";

const program = new Command();

program
  .name("c2mtools")
  .description("C2M tools (.c2m <-> JSON, transforms, renderer)")
  .version("0.6.0");

program
  .command("to-json")
  .description("Convert .c2m file to JSON")
  .argument("<input>", "Path to .c2m file")
  .option("-o, --output <path>", "Write JSON to a file (default: stdout)")
  .action(async (input: string, opts: { output?: string }) => {
    const bytes = await readFile(input);

    const warnings: string[] = [];
    const doc = decodeC2mToJsonV1(bytes, (m) => warnings.push(m));
    for (const w of warnings) console.warn(w);

    const text = stringifyC2mJsonV1(doc);
    if (opts.output) await writeFile(opts.output, text, "utf8");
    else process.stdout.write(text);
  });

program
  .command("from-json")
  .description("Convert JSON file back to .c2m")
  .argument("<input>", "Path to JSON file")
  .requiredOption("-o, --output <path>", "Write .c2m to this path")
  .action(async (input: string, opts: { output: string }) => {
    const text = await readFile(input, "utf8");
    const parsed: unknown = JSON.parse(text);
    const doc = parseC2mJsonV1(parsed);

    const bytes = encodeC2mFromJsonV1(doc);
    await writeFile(opts.output, bytes);
  });

program
  .command("transform")
  .description(
    "Apply a geometric transform to a level or folder of levels. Default is to write copies; use --in-place to overwrite.",
  )
  .argument("op", "rot90|rot180|rot270|flip-h|flip-v|flip-nwse|flip-nesw")
  .argument("input", "Path to .c2m/.json OR a directory containing .c2m files")
  .option("-o, --out <path>", "Output file (single input) or output dir (directory input)")
  .option("--in-place", "Overwrite inputs in place (use with care)", false)
  .option("--recursive", "Recurse into subdirectories (directory input)", false)
  .option("--include-json", "When input is a directory, include .json files too", false)
  .option("--overwrite", "Allow overwriting existing outputs (non in-place)", false)
  .option("--backup", "When --in-place, write a .bak copy before overwriting", false)
  .option("--dry-run", "Print planned operations but do not write anything", false)
  .action(
    async (
      op: string,
      input: string,
      opts: {
        out?: string;
        inPlace: boolean;
        recursive: boolean;
        includeJson: boolean;
        overwrite: boolean;
        backup: boolean;
        dryRun: boolean;
      },
    ) => {
      await runTransformTool(op, input, opts);
    },
  );

program
  .command("render")
  .description("Render a level or folder of levels to PNGs using a CC2 spritesheet")
  .argument("input", "Path to .c2m/.json OR directory")
  .option("--tileset <path>", "Path to spritesheet.png", "assets/cc2/spritesheet.png")
  .option("-o, --out <path>", "Output file (single input) or output dir (directory input)")
  .option("--recursive", "Recurse into subdirectories (directory input)", false)
  .option("--include-json", "When input is a directory, include .json files too", false)
  .option("--overwrite", "Overwrite existing PNGs", false)
  .option("--dry-run", "Print planned operations but do not write anything", false)
  .action(
    async (
      input: string,
      opts: {
        tileset: string;
        out?: string;
        recursive: boolean;
        includeJson: boolean;
        overwrite: boolean;
        dryRun: boolean;
      },
    ) => {
      const params: {
        tilesetPath: string;
        out?: string;
        recursive: boolean;
        includeJson: boolean;
        overwrite: boolean;
        dryRun: boolean;
      } = {
        tilesetPath: opts.tileset,
        recursive: opts.recursive,
        includeJson: opts.includeJson,
        overwrite: opts.overwrite,
        dryRun: opts.dryRun,
      };
      if (opts.out !== undefined) params.out = opts.out;
      await runRenderTool(input, params);
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(msg + "\n");
  process.exitCode = 1;
});
