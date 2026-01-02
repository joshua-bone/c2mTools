import { createHash } from "node:crypto";
import type { C2mOpaqueJsonV1 } from "./types.js";

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function c2mBytesToOpaqueJsonV1(bytes: Uint8Array): C2mOpaqueJsonV1 {
  return {
    schema: "c2mTools.c2m.opaque.v1",
    encoding: "base64",
    sha256: sha256Hex(bytes),
    dataBase64: Buffer.from(bytes).toString("base64"),
  };
}

export function opaqueJsonV1ToC2mBytes(doc: C2mOpaqueJsonV1): Uint8Array {
  const bytes = Buffer.from(doc.dataBase64, "base64");
  const actual = sha256Hex(bytes);

  if (actual !== doc.sha256) {
    throw new Error(`SHA-256 mismatch: expected ${doc.sha256} got ${actual}`);
  }
  return bytes;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parseOpaqueJsonV1(input: unknown): C2mOpaqueJsonV1 {
  if (!isRecord(input)) throw new Error("Invalid JSON: expected object");

  const schema = input.schema;
  const encoding = input.encoding;
  const sha256 = input.sha256;
  const dataBase64 = input.dataBase64;

  if (schema !== "c2mTools.c2m.opaque.v1") throw new Error("Invalid schema");
  if (encoding !== "base64") throw new Error("Invalid encoding");
  if (typeof sha256 !== "string") throw new Error("Invalid sha256");
  if (typeof dataBase64 !== "string") throw new Error("Invalid dataBase64");

  return { schema, encoding, sha256, dataBase64 };
}

export function stringifyOpaqueJsonV1(doc: C2mOpaqueJsonV1): string {
  return (
    JSON.stringify(
      {
        schema: doc.schema,
        encoding: doc.encoding,
        sha256: doc.sha256,
        dataBase64: doc.dataBase64,
      },
      null,
      2,
    ) + "\n"
  );
}
