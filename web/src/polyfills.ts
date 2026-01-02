import { Buffer } from "buffer";

type GlobalWithBuffer = typeof globalThis & {
  Buffer?: typeof Buffer;
};

const g = globalThis as GlobalWithBuffer;

// Ensure Buffer exists for codec modules that expect it.
if (!g.Buffer) g.Buffer = Buffer;
