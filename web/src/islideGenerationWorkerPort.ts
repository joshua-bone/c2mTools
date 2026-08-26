import type {
  ISlideGenerationWorkerRequest,
  ISlideGenerationWorkerResponse,
} from "./islideGenerationProtocol.js";
import type {
  ISlideGenerationOptions,
  ISlideGenerationPort,
  ISlideGenerationProgress,
} from "./islideGenerationPort.js";

type WorkerMessageListener = (event: Readonly<{ data: ISlideGenerationWorkerResponse }>) => void;
type WorkerErrorListener = (event: Readonly<{ message: string }>) => void;

export interface ISlideGenerationWorkerLike {
  postMessage(message: ISlideGenerationWorkerRequest): void;
  addEventListener(
    type: "message" | "error",
    listener: WorkerMessageListener | WorkerErrorListener,
  ): void;
  removeEventListener(
    type: "message" | "error",
    listener: WorkerMessageListener | WorkerErrorListener,
  ): void;
  terminate(): void;
}

type WorkerPortOptions = Readonly<{
  createWorker?: () => ISlideGenerationWorkerLike;
}>;

type ActiveRequest = Readonly<{
  requestId: number;
  resolve: (
    layout: Extract<ISlideGenerationWorkerResponse, { type: "complete" }>["layout"],
  ) => void;
  reject: (error: unknown) => void;
  onProgress?: (progress: ISlideGenerationProgress) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}>;

function createBrowserWorker(): ISlideGenerationWorkerLike {
  return new Worker(new URL("./islideGeneration.worker.ts", import.meta.url), {
    type: "module",
    name: "i-slide-generator",
  }) as unknown as ISlideGenerationWorkerLike;
}

function abortError(): DOMException {
  return new DOMException("I SLIDE generation was cancelled", "AbortError");
}

export function createISlideGenerationWorkerPort(
  options: WorkerPortOptions = {},
): ISlideGenerationPort {
  const createWorker = options.createWorker ?? createBrowserWorker;
  let worker: ISlideGenerationWorkerLike | null = null;
  let active: ActiveRequest | null = null;
  let nextRequestId = 0;
  let disposed = false;

  function clearActive(): ActiveRequest | null {
    const request = active;
    active = null;
    if (request?.signal && request.abortListener) {
      request.signal.removeEventListener("abort", request.abortListener);
    }
    return request;
  }

  function destroyWorker(): void {
    if (!worker) return;
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleWorkerError);
    worker.terminate();
    worker = null;
  }

  function cancelActive(): void {
    const request = clearActive();
    if (!request) return;
    // The generator is synchronous inside its worker, so termination is the
    // only prompt and race-free cancellation mechanism.
    destroyWorker();
    request.reject(abortError());
  }

  function handleMessage(event: Readonly<{ data: ISlideGenerationWorkerResponse }>): void {
    const response = event.data;
    if (!active || response.requestId !== active.requestId) return;
    if (response.type === "started") {
      active.onProgress?.({
        phase: "generating",
        message: "Building the sparkle field and reciprocal route graph",
      });
      return;
    }

    const request = clearActive();
    if (!request) return;
    if (response.type === "complete") request.resolve(response.layout);
    else request.reject(new Error(response.message));
  }

  function handleWorkerError(event: Readonly<{ message: string }>): void {
    const request = clearActive();
    destroyWorker();
    request?.reject(new Error(event.message || "I SLIDE generation worker failed"));
  }

  function ensureWorker(): ISlideGenerationWorkerLike {
    if (worker) return worker;
    worker = createWorker();
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerError);
    return worker;
  }

  return {
    generate(seed: string, generationOptions: ISlideGenerationOptions = {}) {
      if (disposed) return Promise.reject(new Error("I SLIDE generation port is disposed"));
      if (generationOptions.signal?.aborted) return Promise.reject(abortError());
      if (active) cancelActive();

      const requestId = nextRequestId + 1;
      nextRequestId = requestId;
      generationOptions.onProgress?.({
        phase: "starting",
        message: "Starting generation worker",
      });

      return new Promise((resolve, reject) => {
        const abortListener = generationOptions.signal
          ? () => {
              if (active?.requestId === requestId) cancelActive();
            }
          : undefined;
        active = {
          requestId,
          resolve,
          reject,
          ...(generationOptions.onProgress ? { onProgress: generationOptions.onProgress } : {}),
          ...(generationOptions.signal ? { signal: generationOptions.signal } : {}),
          ...(abortListener ? { abortListener } : {}),
        };
        generationOptions.signal?.addEventListener("abort", abortListener!, { once: true });
        ensureWorker().postMessage({ type: "generate", requestId, seed });
      });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      const request = clearActive();
      destroyWorker();
      request?.reject(abortError());
    },
  };
}
