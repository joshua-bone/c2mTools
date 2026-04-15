import { describe, expect, it } from "vitest";

import { encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { buildNotccLevelUrl, DEFAULT_NOTCC_BASE_URL } from "../web/src/editor/notcc.js";

describe("NotCC URL builder", () => {
  it("encodes c2m bytes as a url-safe level query parameter", () => {
    const bytes = encodeC2mFromJsonV1(createEmptyC2mDoc());
    const url = new URL(buildNotccLevelUrl(bytes));
    const encoded = url.searchParams.get("level");

    expect(url.origin + url.pathname).toBe(new URL(DEFAULT_NOTCC_BASE_URL).origin + "/notcc/");
    expect(encoded).toBeTruthy();
    expect(encoded).not.toMatch(/[+/]/);

    const decoded = Uint8Array.from(
      Buffer.from(encoded!.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
    );
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
