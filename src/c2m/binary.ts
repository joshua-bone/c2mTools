export class BinaryReader {
  private offset = 0;

  public constructor(private readonly buf: Buffer) {}

  public remaining(): number {
    return this.buf.length - this.offset;
  }

  public readU8(): number {
    this.ensure(1);
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  public readU16LE(): number {
    this.ensure(2);
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  public readU32LE(): number {
    this.ensure(4);
    const v = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  public readBytes(n: number): Buffer {
    if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid read length: ${n}`);
    this.ensure(n);
    const out = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  private ensure(n: number): void {
    if (this.offset + n > this.buf.length) {
      throw new Error(`Unexpected EOF: need ${n} bytes, have ${this.remaining()}`);
    }
  }
}

export class BinaryWriter {
  private readonly chunks: Buffer[] = [];

  public writeU8(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > 0xff) throw new Error(`U8 out of range: ${v}`);
    const b = Buffer.alloc(1);
    b.writeUInt8(v, 0);
    this.chunks.push(b);
  }

  public writeU16LE(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new Error(`U16 out of range: ${v}`);
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v, 0);
    this.chunks.push(b);
  }

  public writeU32LE(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new Error(`U32 out of range: ${v}`);
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0, 0);
    this.chunks.push(b);
  }

  public writeTag4(tag: string): void {
    if (tag.length !== 4) throw new Error(`Tag must be 4 chars: '${tag}'`);
    const b = Buffer.from(tag, "ascii");
    if (b.length !== 4) throw new Error(`Tag must be 4 bytes ASCII: '${tag}'`);
    this.chunks.push(b);
  }

  public writeBytes(bytes: Uint8Array): void {
    this.chunks.push(Buffer.from(bytes));
  }

  public toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}
