import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildDefaultISlideExportBundle, ISLIDE_EXPORT_FILE_NAMES } from "./islide_export.js";

export type ISlideWriteResult = Readonly<{
  outputDirectory: string;
  c2mPath: string;
  graphJsonPath: string;
  graphSvgPath: string;
  fingerprint: string;
  replayHashHex: string;
  replayFrames: number;
  validation: ReturnType<typeof buildDefaultISlideExportBundle>["artifact"]["validation"];
}>;

function defaultOutputDirectory(): string {
  return path.resolve(process.cwd(), "generated");
}

export function writeDefaultISlideArtifacts(
  outputDirectory = defaultOutputDirectory(),
): ISlideWriteResult {
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  const bundle = buildDefaultISlideExportBundle();
  const c2mPath = path.join(resolvedOutputDirectory, ISLIDE_EXPORT_FILE_NAMES.c2m);
  const graphJsonPath = path.join(resolvedOutputDirectory, ISLIDE_EXPORT_FILE_NAMES.graphJson);
  const graphSvgPath = path.join(resolvedOutputDirectory, ISLIDE_EXPORT_FILE_NAMES.graphSvg);

  fs.mkdirSync(resolvedOutputDirectory, { recursive: true });
  fs.writeFileSync(c2mPath, bundle.artifact.c2mBytes);
  fs.writeFileSync(graphJsonPath, bundle.graphJson, "utf8");
  fs.writeFileSync(graphSvgPath, bundle.graphSvg, "utf8");

  return {
    outputDirectory: resolvedOutputDirectory,
    c2mPath,
    graphJsonPath,
    graphSvgPath,
    fingerprint: bundle.layout.fingerprint,
    replayHashHex: bundle.artifact.replayHashHex,
    replayFrames: bundle.artifact.replayFrames,
    validation: bundle.artifact.validation,
  };
}

function parseOutputDirectory(argv: ReadonlyArray<string>): string {
  if (argv.length === 0) return defaultOutputDirectory();
  if (argv.length === 2 && argv[0] === "--out-dir" && argv[1]) {
    return path.resolve(process.cwd(), argv[1]);
  }
  throw new Error("Usage: npm run generate:islide -- [--out-dir <directory>]");
}

function displayPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}

function main(): void {
  const result = writeDefaultISlideArtifacts(parseOutputDirectory(process.argv.slice(2)));
  console.log(`Wrote ${displayPath(result.c2mPath)}`);
  console.log(`Wrote ${displayPath(result.graphJsonPath)}`);
  console.log(`Wrote ${displayPath(result.graphSvgPath)}`);
  console.log(
    `Replay validation: ${result.validation.ok ? "PASS" : "FAIL"} ` +
      `(${result.validation.engineOutcome}, ${result.validation.chipsLeft} chips left, ` +
      `${result.validation.postInputTicks} post-input ticks)`,
  );
  console.log(`Replay MD5: ${result.replayHashHex}`);
  console.log(`Layout fingerprint: ${result.fingerprint}`);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href) {
  main();
}
