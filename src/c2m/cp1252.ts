const CP1252_EXT: ReadonlyArray<number> = [
  0x20ac, // 0x80 €
  0x0081, // 0x81 (undefined)
  0x201a, // 0x82
  0x0192, // 0x83
  0x201e, // 0x84
  0x2026, // 0x85
  0x2020, // 0x86
  0x2021, // 0x87
  0x02c6, // 0x88
  0x2030, // 0x89
  0x0160, // 0x8A
  0x2039, // 0x8B
  0x0152, // 0x8C
  0x008d, // 0x8D (undefined)
  0x017d, // 0x8E
  0x008f, // 0x8F (undefined)
  0x0090, // 0x90 (undefined)
  0x2018, // 0x91
  0x2019, // 0x92
  0x201c, // 0x93
  0x201d, // 0x94
  0x2022, // 0x95
  0x2013, // 0x96
  0x2014, // 0x97
  0x02dc, // 0x98
  0x2122, // 0x99
  0x0161, // 0x9A
  0x203a, // 0x9B
  0x0153, // 0x9C
  0x009d, // 0x9D (undefined)
  0x017e, // 0x9E
  0x0178, // 0x9F
];

const REVERSE = new Map<number, number>();
for (let i = 0; i < CP1252_EXT.length; i++) {
  REVERSE.set(CP1252_EXT[i]!, 0x80 + i);
}

export function decodeCp1252(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    if (b <= 0x7f || b >= 0xa0) {
      out += String.fromCharCode(b);
    } else {
      out += String.fromCharCode(CP1252_EXT[b - 0x80]!);
    }
  }
  return out;
}

export function encodeCp1252(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;

    if (cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff)) {
      out.push(cp);
      continue;
    }

    // Preserve undefined C1 control chars as bytes 0x80..0x9F
    if (cp >= 0x80 && cp <= 0x9f) {
      out.push(cp);
      continue;
    }

    const mapped = REVERSE.get(cp);
    if (mapped !== undefined) {
      out.push(mapped);
      continue;
    }

    throw new Error(`Cannot encode character U+${cp.toString(16).toUpperCase()} in windows-1252`);
  }
  return Uint8Array.from(out);
}
