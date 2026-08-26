/// <reference lib="webworker" />

import {
  DEFAULT_ISLIDE_GENERATOR_CONFIG,
  generateISlideLayout,
} from "../../procedural_generation/islide_generator.js";
import type {
  ISlideGenerationWorkerRequest,
  ISlideGenerationWorkerResponse,
} from "./islideGenerationProtocol.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

self.addEventListener("message", (event: MessageEvent<ISlideGenerationWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "generate") return;

  const started: ISlideGenerationWorkerResponse = {
    type: "started",
    requestId: request.requestId,
  };
  self.postMessage(started);

  try {
    const layout = generateISlideLayout({
      ...DEFAULT_ISLIDE_GENERATOR_CONFIG,
      seed: request.seed,
    });
    const complete: ISlideGenerationWorkerResponse = {
      type: "complete",
      requestId: request.requestId,
      layout,
    };
    self.postMessage(complete);
  } catch (error) {
    const failed: ISlideGenerationWorkerResponse = {
      type: "error",
      requestId: request.requestId,
      message: errorMessage(error),
    };
    self.postMessage(failed);
  }
});
