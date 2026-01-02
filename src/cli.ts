import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";

import {
  decodeC2mToJsonV1,
  encodeC2mFromJsonV1,
  parseC2mJsonV1,
  stringifyC2mJsonV1,
} from "./c2m/c2mJsonV1.js";

const program = new Command();

program
  .name("c2mtools")
  .description("Convert .c2m <-> JSON (v1: unpack PACK -> map base64)")
  .version("0.2.0");

program
  .command("to-json")
  .description("Convert .c2m file to JSON (unpacks PACK map)")
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
  .description("Convert JSON file back to .c2m (packs map into PACK)")
  .argument("<input>", "Path to JSON file")
  .requiredOption("-o, --output <path>", "Write .c2m to this path")
  .action(async (input: string, opts: { output: string }) => {
    const text = await readFile(input, "utf8");
    const parsed: unknown = JSON.parse(text);
    const doc = parseC2mJsonV1(parsed);

    const bytes = encodeC2mFromJsonV1(doc);
    await writeFile(opts.output, bytes);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(msg + "\n");
  process.exitCode = 1;
});
