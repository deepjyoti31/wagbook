import { describe, expect, it } from "vitest";
import { isJpeg, stripJpegMetadata } from "./jpeg";

const segment = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A tiny JPEG-shaped file: JFIF, EXIF with a fake GPS tag, a comment, a colour profile, the picture, end. */
function photo(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    ...segment(0xe0, ascii("JFIF\0")),
    ...segment(0xe1, ascii("Exif\0\0GPS 12.97N 77.59E")),
    ...segment(0xfe, ascii("Taken at the kennel")),
    ...segment(0xe2, ascii("ICC_PROFILE\0")),
    ...segment(0xed, ascii("Photoshop 3.0 IPTC city")),
    ...segment(0xdb, [0, 1, 2]),
    ...segment(0xda, [0, 1]),
    0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78,
    0xff, 0xd9,
  ]);
}

const text = (b: Uint8Array) => String.fromCharCode(...b);

describe("removing hidden data from photos", () => {
  it("drops location, comments and IPTC, and keeps the picture byte for byte", () => {
    const clean = stripJpegMetadata(photo());
    expect(isJpeg(clean)).toBe(true);
    expect(text(clean)).not.toContain("GPS");
    expect(text(clean)).not.toContain("kennel");
    expect(text(clean)).not.toContain("IPTC");
    expect(text(clean)).toContain("JFIF");
    expect(text(clean)).toContain("ICC_PROFILE");
    // Everything from the start of scan to the end is untouched.
    const original = photo();
    const sos = (b: Uint8Array) => b.findIndex((v, i) => v === 0xff && b[i + 1] === 0xda);
    expect([...clean.slice(sos(clean))]).toEqual([...original.slice(sos(original))]);
  });

  it("refuses something that is not a JPEG, or is cut short", () => {
    expect(() => stripJpegMetadata(Uint8Array.from(ascii("%PDF-1.7")))).toThrow();
    expect(() => stripJpegMetadata(photo().slice(0, 30))).toThrow();
  });
});
