export const DEFAULT_C2M_FILE_NAME = "level.c2m";
export const DEFAULT_JSON_FILE_NAME = "level.json";

function trimFileName(fileName: string | null | undefined): string {
  return typeof fileName === "string" ? fileName.trim() : "";
}

function stripKnownExtension(fileName: string): string {
  if (fileName.toLowerCase().endsWith(".c2m")) return fileName.slice(0, -4);
  if (fileName.toLowerCase().endsWith(".json")) return fileName.slice(0, -5);
  return fileName;
}

export function normalizeC2mFileName(fileName: string | null | undefined): string {
  const trimmed = trimFileName(fileName);
  if (trimmed.length === 0) return DEFAULT_C2M_FILE_NAME;
  if (trimmed.toLowerCase().endsWith(".c2m")) return trimmed;
  return `${stripKnownExtension(trimmed)}.c2m`;
}

export function normalizeJsonFileName(fileName: string | null | undefined): string {
  const trimmed = trimFileName(fileName);
  if (trimmed.length === 0) return DEFAULT_JSON_FILE_NAME;
  if (trimmed.toLowerCase().endsWith(".json")) return trimmed;
  return `${stripKnownExtension(trimmed)}.json`;
}
