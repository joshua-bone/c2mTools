import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function bytesFromBase64(dataBase64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(dataBase64, "base64"));
}

export function compressStoredJson(json: string): string {
  return bytesToBase64(gzipSync(strToU8(json)));
}

export function decompressStoredJson(dataBase64: string): string {
  return strFromU8(gunzipSync(bytesFromBase64(dataBase64)));
}
