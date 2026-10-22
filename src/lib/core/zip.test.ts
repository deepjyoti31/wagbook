import { describe, expect, it } from "vitest";
import { crc32, readZipStore, ZipWriter, zipStore } from "./zip";

/** Reads a ZIP back through its central directory, as an unzip tool does. */
function readZip(zip: Uint8Array): { name: string; bytes: Uint8Array; crc: number; flags: number }[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 24, true);
    const nameLength = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    out.push({ name, bytes: zip.subarray(start, start + size), crc, flags: v.getUint16(at + 8, true) });
    at += 46 + nameLength;
  }
  return out;
}

describe("zip files", () => {
  it("carry the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("hold each file as it is, with UTF-8 names, read back by the central directory", () => {
    const json = new TextEncoder().encode('{"name":"Priya"}');
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 0xff, 0xd9]);
    const zip = zipStore([
      { name: "parent.json", bytes: json },
      { name: "files/org/pets/बिस्किट.jpg", bytes: photo },
      { name: "files/empty.txt", bytes: new Uint8Array() },
    ], new Date("2026-11-03T10:20:30Z"));
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual(["parent.json", "files/org/pets/बिस्किट.jpg", "files/empty.txt"]);
    expect([...files[0].bytes]).toEqual([...json]);
    expect([...files[1].bytes]).toEqual([...photo]);
    expect(files[1].crc).toBe(crc32(photo));
    expect(files.every((f) => f.flags === 0x0800)).toBe(true);
  });

  it("is an empty archive with no files", () => {
    expect(readZip(zipStore([]))).toEqual([]);
  });

  it("are read back by readZipStore, which notices damage", () => {
    const zip = zipStore([{ name: "a.txt", bytes: new TextEncoder().encode("hello") }]);
    expect(readZipStore(zip).map((f) => [f.name, new TextDecoder().decode(f.bytes)])).toEqual([["a.txt", "hello"]]);
    const damaged = zip.slice();
    damaged[30 + 5] ^= 1;
    expect(() => readZipStore(damaged)).toThrow("damaged");
  });

  it("are the same written a piece at a time", () => {
    const at = new Date(Date.UTC(2026, 9, 22, 10, 30));
    const files = [
      { name: "Mithai/2026-09-01 1.jpg", bytes: new Uint8Array([255, 216, 1, 2, 3]) },
      { name: "Laddoo/2026-09-02 1.jpg", bytes: new Uint8Array([255, 216, 9]) },
    ];
    const writer = new ZipWriter(at);
    const pieces = [...files.map((f) => writer.add(f)), writer.end()];
    const joined = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of pieces) {
      joined.set(p, i);
      i += p.length;
    }
    expect(joined).toEqual(zipStore(files, at));
    expect(readZipStore(joined).map((f) => f.name)).toEqual(files.map((f) => f.name));
  });
});
