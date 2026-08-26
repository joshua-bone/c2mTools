import { describe, expect, it } from "vitest";

import type { ISlideLayout } from "../../procedural_generation/islide_generator.js";
import type {
  ISlideGenerationWorkerRequest,
  ISlideGenerationWorkerResponse,
} from "./islideGenerationProtocol.js";
import {
  createISlideGenerationWorkerPort,
  type ISlideGenerationWorkerLike,
} from "./islideGenerationWorkerPort.js";

const layout = { fingerprint: "worker-layout" } as ISlideLayout;

class FakeWorker implements ISlideGenerationWorkerLike {
  readonly requests: ISlideGenerationWorkerRequest[] = [];
  terminated = false;
  private readonly messageListeners = new Set<
    (event: Readonly<{ data: ISlideGenerationWorkerResponse }>) => void
  >();
  private readonly errorListeners = new Set<(event: Readonly<{ message: string }>) => void>();

  postMessage(message: ISlideGenerationWorkerRequest): void {
    this.requests.push(message);
  }

  addEventListener(
    type: "message" | "error",
    listener:
      | ((event: Readonly<{ data: ISlideGenerationWorkerResponse }>) => void)
      | ((event: Readonly<{ message: string }>) => void),
  ): void {
    if (type === "message") {
      this.messageListeners.add(
        listener as (event: Readonly<{ data: ISlideGenerationWorkerResponse }>) => void,
      );
    } else {
      this.errorListeners.add(listener as (event: Readonly<{ message: string }>) => void);
    }
  }

  removeEventListener(
    type: "message" | "error",
    listener:
      | ((event: Readonly<{ data: ISlideGenerationWorkerResponse }>) => void)
      | ((event: Readonly<{ message: string }>) => void),
  ): void {
    if (type === "message") {
      this.messageListeners.delete(
        listener as (event: Readonly<{ data: ISlideGenerationWorkerResponse }>) => void,
      );
    } else {
      this.errorListeners.delete(listener as (event: Readonly<{ message: string }>) => void);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(response: ISlideGenerationWorkerResponse): void {
    for (const listener of this.messageListeners) listener({ data: response });
  }
}

describe("I SLIDE generation worker port", () => {
  it("runs generation behind the worker boundary and forwards honest phase progress", async () => {
    const workers: FakeWorker[] = [];
    const port = createISlideGenerationWorkerPort({
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    const phases: string[] = [];
    const promise = port.generate("worker-seed", {
      onProgress: (progress) => phases.push(progress.phase),
    });
    const request = workers[0]!.requests[0]!;

    expect(request).toMatchObject({ type: "generate", seed: "worker-seed" });
    workers[0]!.emit({ type: "started", requestId: request.requestId });
    workers[0]!.emit({ type: "complete", requestId: request.requestId, layout });

    await expect(promise).resolves.toBe(layout);
    expect(phases).toEqual(["starting", "generating"]);
    expect(workers[0]!.terminated).toBe(false);

    port.dispose();
    expect(workers[0]!.terminated).toBe(true);
  });

  it("terminates blocked work on abort and ignores its late completion", async () => {
    const workers: FakeWorker[] = [];
    const port = createISlideGenerationWorkerPort({
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    const controller = new AbortController();
    const abandoned = port.generate("slow-seed", { signal: controller.signal });
    const abandonedRequest = workers[0]!.requests[0]!;

    controller.abort();
    workers[0]!.emit({ type: "complete", requestId: abandonedRequest.requestId, layout });

    await expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]!.terminated).toBe(true);

    const replacement = port.generate("fresh-seed");
    const replacementRequest = workers[1]!.requests[0]!;
    workers[1]!.emit({ type: "complete", requestId: replacementRequest.requestId, layout });
    await expect(replacement).resolves.toBe(layout);
  });
});
