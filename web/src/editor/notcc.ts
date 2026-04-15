const DEFAULT_NOTCC_BASE_URL = "https://glander.club/notcc/";
const BASE64_CHUNK_SIZE = 0x8000;

export function encodeNotccLevelParam(bytes: Uint8Array): string {
  let binary = "";

  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(start, start + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

export function buildNotccLevelUrl(bytes: Uint8Array, baseUrl = DEFAULT_NOTCC_BASE_URL): string {
  const url = new URL(baseUrl);
  url.searchParams.set("level", encodeNotccLevelParam(bytes));
  return url.toString();
}

export { DEFAULT_NOTCC_BASE_URL };
