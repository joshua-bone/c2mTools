import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";

import {
  c2mBytesToOpaqueJsonV1,
  opaqueJsonV1ToC2mBytes,
  parseOpaqueJsonV1,
  stringifyOpaqueJsonV1
} from "./c2m/opaque/codec.js";

const program = new Command();

program
  .name("c2mtools")
  .description("C2M tools (opaque stub codec until semantic C2M is implemented)")
  .version("0.1.0");

program
  .command("to-json")
  .description("Convert .c2m to JSON (opaque, lossless)")
  .argument("<input>", "Path to .c2m file")
  .option("-o, --output <path>", "Write JSON to a file (default: stdout)")
  .action(async (input: string, opts: { output?: string }) => {
    const bytes = await readFile(input);
    const doc = c2mBytesToOpaqueJsonV1(bytes);
    const text = stringifyOpaqueJsonV1(doc);

    if (opts.output) await writeFile(opts.output, text, "utf8");
    else process.stdout.write(text);
  });

program
  .command("from-json")
  .description("Convert JSON back to .c2m (opaque, lossless)")
  .argument("<input>", "Path to JSON file")
  .requiredOption("-o, --output <path>", "Write .c2m to this path")
  .action(async (input: string, opts: { output: string }) => {
    const text = await readFile(input, "utf8");
    const parsed: unknown = JSON.parse(text);
    const doc = parseOpaqueJsonV1(parsed);
    const bytes = opaqueJsonV1ToC2mBytes(doc);
    await writeFile(opts.output, bytes);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(msg + "\n");
  process.exitCode = 1;
});
