/**
 * A ZIP file of files stored as they are (no compression), for the export of
 * a parent's details with their photos and certificates (M44). Photos and
 * PDFs are compressed already, so storing them loses nothing, and the
 * format is small enough to write here instead of adding a library (D48).
 * Names are UTF-8; no file may be 4 GB or more, nor the whole.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 a ZIP file carries for each file. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** The path inside the file, with forward slashes: "files/photo.jpg". */
  name: string;
  bytes: Uint8Array;
}

/** A date and time in the old MS-DOS form ZIP uses, read as local time by whoever opens it. */
function dosTime(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getUTCFullYear());
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

/**
 * A ZIP file written a piece at a time, so a month of photos (M49) never sits
 * in memory whole: add() gives the bytes for one file, end() the directory
 * that closes the ZIP. Sending every piece in order makes the same file as
 * zipStore().
 */
export class ZipWriter {
  private readonly encoder = new TextEncoder();
  private readonly time: number;
  private readonly date: number;
  private readonly centrals: Uint8Array[] = [];
  private offset = 0;

  constructor(at: Date = new Date()) {
    ({ time: this.time, date: this.date } = dosTime(at));
  }

  /** How many bytes have been given out so far. */
  get size(): number {
    return this.offset;
  }

  add(entry: ZipEntry): Uint8Array {
    const name = this.encoder.encode(entry.name.replace(/^\/+/, ""));
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + name.length + size);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true); // version needed: 2.0
    l.setUint16(6, 0x0800, true); // names are UTF-8
    l.setUint16(8, 0, true); // stored
    l.setUint16(10, this.time, true);
    l.setUint16(12, this.date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, size, true);
    l.setUint32(22, size, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true); // made by: 2.0
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, this.time, true);
    c.setUint16(14, this.date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, this.offset, true);
    central.set(name, 46);
    this.centrals.push(central);

    this.offset += local.length;
    return local;
  }

  end(): Uint8Array {
    const centralSize = this.centrals.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(centralSize + 22);
    let written = 0;
    for (const c of this.centrals) {
      out.set(c, written);
      written += c.length;
    }
    const e = new DataView(out.buffer, centralSize);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, this.centrals.length, true);
    e.setUint16(10, this.centrals.length, true);
    e.setUint32(12, centralSize, true);
    e.setUint32(16, this.offset, true);
    return out;
  }
}

/** The ZIP file holding these files, each stored as it is. */
export function zipStore(entries: readonly ZipEntry[], at: Date = new Date()): Uint8Array {
  const writer = new ZipWriter(at);
  const parts = [...entries.map((entry) => writer.add(entry)), writer.end()];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let written = 0;
  for (const part of parts) {
    out.set(part, written);
    written += part.length;
  }
  return out;
}

/** The files of a ZIP made by zipStore() (stored, not compressed), read through its central directory. */
export function readZipStore(zip: Uint8Array): ZipEntry[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  if (end < 0 || v.getUint32(end, true) !== 0x06054b50) throw new Error("Not a ZIP file this reader knows");
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(at, true) !== 0x02014b50 || v.getUint16(at + 10, true) !== 0) throw new Error("Not a stored ZIP file");
    const size = v.getUint32(at + 24, true);
    const nameLength = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const bytes = zip.slice(start, start + size);
    if (crc32(bytes) !== v.getUint32(at + 16, true)) throw new Error("A file in the ZIP is damaged");
    out.push({ name: new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)), bytes });
    at += 46 + nameLength + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  return out;
}
