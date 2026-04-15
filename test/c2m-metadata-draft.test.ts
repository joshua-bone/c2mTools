import { describe, expect, it } from "vitest";

import { decodeC2mToJsonV1, encodeC2mFromJsonV1, parseC2mJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";
import { applyMetadataDraft, makeMetadataDraft } from "../web/src/editor/metadataDraft.js";

function blob(...bytes: number[]) {
  return {
    encoding: "base64" as const,
    dataBase64: Buffer.from(bytes).toString("base64"),
  };
}

describe("c2m metadata draft helpers", () => {
  it("surfaces editor defaults for dropdown-backed advanced options", () => {
    const draft = makeMetadataDraft(createEmptyC2mDoc({ width: 10, height: 10 }));

    expect(draft.fileVersion).toBe("7");
    expect(draft.editorWindow).toBe("0");
    expect(draft.verifiedReplay).toBe("0");
    expect(draft.hideMap).toBe("0");
    expect(draft.readOnlyOption).toBe("0");
    expect(draft.hideLogic).toBe("0");
    expect(draft.cc1Boots).toBe("0");
    expect(draft.blobPatterns).toBe("2");
  });

  it("adds metadata to decoded docs with preserved sections while keeping extra payloads intact", () => {
    const decoded = decodeC2mToJsonV1(
      encodeC2mFromJsonV1(
        parseC2mJsonV1({
          ...createEmptyC2mDoc({ width: 10, height: 10 }),
          key: blob(1, 2, 3),
          replay: blob(4, 5, 6),
          options: {
            extra: blob(9, 8, 7),
          },
          extraChunks: [{ tag: "XTRA", data: blob(6, 6, 6) }],
        }),
      ),
    );

    const nextDoc = applyMetadataDraft(decoded, {
      ...makeMetadataDraft(decoded),
      fileVersion: "7",
      title: "Metadata Title",
      author: "Metadata Author",
      readOnlyChunk: true,
      time: "120",
    });
    const reparsed = decodeC2mToJsonV1(encodeC2mFromJsonV1(nextDoc));

    expect(reparsed.title).toBe("Metadata Title");
    expect(reparsed.author).toBe("Metadata Author");
    expect(reparsed.fileVersion).toBe("7\u0000");
    expect(reparsed.readOnlyChunk).toBe(true);
    expect(reparsed.options?.time).toBe(120);
    expect(reparsed.options?.extra).toEqual(decoded.options?.extra);
    expect(reparsed.key).toEqual(decoded.key);
    expect(reparsed.replay).toEqual(decoded.replay);
    expect(reparsed.extraChunks).toEqual(decoded.extraChunks);
  });

  it("removes cleared text metadata from preserved-section documents", () => {
    const decoded = decodeC2mToJsonV1(
      encodeC2mFromJsonV1(
        parseC2mJsonV1({
          ...createEmptyC2mDoc({ width: 10, height: 10 }),
          title: "Alpha",
          lock: "LOCKED",
        }),
      ),
    );

    const nextDoc = applyMetadataDraft(decoded, {
      ...makeMetadataDraft(decoded),
      title: "",
      lock: "",
    });
    const reparsed = decodeC2mToJsonV1(encodeC2mFromJsonV1(nextDoc));

    expect(reparsed.title).toBeUndefined();
    expect(reparsed.lock).toBeUndefined();
  });
});
