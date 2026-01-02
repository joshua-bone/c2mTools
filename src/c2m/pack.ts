// src/c2m/pack.ts
import { BinaryReader, BinaryWriter } from "./binary.js";

export function unpackC2mPacked(packed: Uint8Array): Uint8Array {
  const r = new BinaryReader(Buffer.from(packed));
  const outLen = r.readU16LE();
  const out = Buffer.alloc(outLen);

  let pos = 0;
  while (pos < outLen) {
    const n = r.readU8();

    if (n <= 0x7f) {
      const lit = r.readBytes(n);
      if (pos + lit.length > outLen) {
        throw new Error(`Packed stream overruns output: pos=${pos} + ${lit.length} > ${outLen}`);
      }
      lit.copy(out, pos);
      pos += lit.length;
      continue;
    }

    const count = n - 0x80;
    const offset = r.readU8();
    if (offset === 0) throw new Error("Invalid backref offset 0");
    if (offset > pos) throw new Error(`Backref offset beyond start: offset=${offset}, pos=${pos}`);
    if (pos + count > outLen) {
      throw new Error(`Backref overruns output: pos=${pos} + ${count} > ${outLen}`);
    }

    for (let i = 0; i < count; i++) {
      const srcIndex = pos - offset + (i % offset);
      out[pos + i] = out[srcIndex]!;
    }
    pos += count;
  }

  return out;
}

/**
 * Minimal, deterministic packer: emits only literal blocks (n <= 0x7F).
 * Valid for the C2M pack format, but not size-optimal.
 */
export function packC2mLiteralOnly(unpacked: Uint8Array): Uint8Array {
  if (unpacked.length > 0xffff) {
    throw new Error(`Unpacked payload too large for pack header (u16): ${unpacked.length}`);
  }

  const w = new BinaryWriter();
  w.writeU16LE(unpacked.length);

  let i = 0;
  while (i < unpacked.length) {
    const chunkLen = Math.min(0x7f, unpacked.length - i);
    w.writeU8(chunkLen);
    w.writeBytes(unpacked.subarray(i, i + chunkLen));
    i += chunkLen;
  }

  return w.toBuffer();
}
