import type { ISlideLayout } from "../../procedural_generation/islide_generator.js";

export const DEFAULT_ISLIDE_SEED = "i-slide-99";

export type ISlideGenerationProgress = Readonly<{
  phase: "starting" | "generating";
  message: string;
}>;

export type ISlideGenerationOptions = Readonly<{
  signal?: AbortSignal;
  onProgress?: (progress: ISlideGenerationProgress) => void;
}>;

/** Application port: React knows how to request a layout, not how it is computed. */
export interface ISlideGenerationPort {
  generate(seed: string, options?: ISlideGenerationOptions): Promise<ISlideLayout>;
  dispose(): void;
}
