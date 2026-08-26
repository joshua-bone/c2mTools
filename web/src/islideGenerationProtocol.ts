import type { ISlideLayout } from "../../procedural_generation/islide_generator.js";

export type ISlideGenerationWorkerRequest = Readonly<{
  type: "generate";
  requestId: number;
  seed: string;
}>;

export type ISlideGenerationWorkerResponse =
  | Readonly<{ type: "started"; requestId: number }>
  | Readonly<{ type: "complete"; requestId: number; layout: ISlideLayout }>
  | Readonly<{ type: "error"; requestId: number; message: string }>;
