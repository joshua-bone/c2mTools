import { describe, expect, it } from "vitest";

import { decodeC2mToJsonV1, encodeC2mFromJsonV1 } from "../src/c2m/c2mJsonV1.js";
import { createEmptyC2mDoc } from "../web/src/editor/createEmptyC2mDoc.js";

type SectionInfo = {
  tag: string;
  offset: number;
  length: number;
  payload: Buffer;
};

const NULL_TERMINATED_TEXT_TAGS = new Set(["CC2M", "LOCK", "TITL", "AUTH", "VERS", "CLUE", "NOTE"]);

function readSections(bytes: Uint8Array): SectionInfo[] {
  const buffer = Buffer.from(bytes);
  const sections: SectionInfo[] = [];

  for (let offset = 0; offset + 8 <= buffer.length; ) {
    const tag = buffer.subarray(offset, offset + 4).toString("ascii");
    const length = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    if (tag === "END ") break;
    sections.push({
      tag,
      offset,
      length,
      payload: buffer.subarray(payloadOffset, payloadOffset + length),
    });
    offset = payloadOffset + length;
  }

  return sections;
}

function assertNotccOffsets(bytes: Uint8Array): void {
  const buffer = Buffer.from(bytes);

  for (let offset = 0; offset + 8 <= buffer.length; ) {
    const tag = buffer.subarray(offset, offset + 4).toString("ascii");
    const length = buffer.readUInt32LE(offset + 4);
    let cursor = offset + 8;
    const payloadStart = cursor;

    if (tag === "END ") return;

    if (NULL_TERMINATED_TEXT_TAGS.has(tag)) {
      while (cursor < buffer.length && buffer[cursor] !== 0) cursor++;
      if (cursor < buffer.length) cursor++;
    } else {
      cursor += length;
    }

    if (payloadStart + length !== cursor) {
      throw new Error("Offsets don't match up!");
    }

    offset = cursor;
  }
}

function dropTitleTerminator(bytes: Uint8Array): Uint8Array {
  const sections = readSections(bytes);
  const title = sections.find((section) => section.tag === "TITL");
  if (!title) throw new Error("Missing TITL section");
  if (title.payload.length <= 0 || title.payload[title.payload.length - 1] !== 0) {
    throw new Error("TITL section is already missing a terminator");
  }

  const buffer = Buffer.from(bytes);
  const before = buffer.subarray(0, title.offset);
  const header = Buffer.alloc(8);
  header.write("TITL", 0, "ascii");
  header.writeUInt32LE(title.length - 1, 4);
  const payload = title.payload.subarray(0, title.payload.length - 1);
  const after = buffer.subarray(title.offset + 8 + title.length);
  return Buffer.concat([before, header, payload, after]);
}

describe("c2m text sections", () => {
  it("writes spec-compliant null terminators and repairs malformed text chunks on re-save", () => {
    const bytes = encodeC2mFromJsonV1({
      ...createEmptyC2mDoc({ width: 10, height: 10 }),
      title: "Level 2",
      author: "Joshua Bone",
    });

    const sections = readSections(bytes);
    expect(sections.find((section) => section.tag === "CC2M")?.payload.at(-1)).toBe(0);
    expect(sections.find((section) => section.tag === "TITL")?.payload.at(-1)).toBe(0);
    expect(sections.find((section) => section.tag === "AUTH")?.payload.at(-1)).toBe(0);
    expect(() => assertNotccOffsets(bytes)).not.toThrow();

    const reparsed = decodeC2mToJsonV1(bytes);
    expect(reparsed.fileVersion).toBe("7");
    expect(reparsed.title).toBe("Level 2");
    expect(reparsed.author).toBe("Joshua Bone");

    const malformed = dropTitleTerminator(bytes);
    expect(() => assertNotccOffsets(malformed)).toThrow("Offsets don't match up!");

    const repaired = encodeC2mFromJsonV1(decodeC2mToJsonV1(malformed));
    expect(() => assertNotccOffsets(repaired)).not.toThrow();
    expect(
      readSections(repaired)
        .find((section) => section.tag === "TITL")
        ?.payload.at(-1),
    ).toBe(0);
  });
});
