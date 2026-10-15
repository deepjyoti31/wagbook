import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrMatrix, qrSvgPath } from "./qr";
import { upiLink } from "./upi";

/** Paint a matrix into pixels, as a phone camera would see it, and read it back. */
function decode(matrix: boolean[][], quiet = 4, scale = 4): string | null {
  const size = (matrix.length + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    }),
  );
  return jsQR(pixels, size, size)?.data ?? null;
}

describe("QR codes for UPI", () => {
  it("encode a pay link that a scanner reads back exactly", () => {
    const link = upiLink({ vpa: "happytails@okhdfcbank", payeeName: "Happy Tails Boarding", amountMinor: 424850, note: "WB/27-28/0001", reference: "WB/27-28/0001" });
    expect(decode(qrMatrix(link))).toBe(link);
  });

  it("cope with a long payee name and a large amount", () => {
    const link = upiLink({ vpa: "a.very.long.upi.id-for-a-kennel@okaxis", payeeName: "A".repeat(60), amountMinor: 999999900, note: "X".repeat(80) });
    expect(decode(qrMatrix(link))).toBe(link);
  });

  it("draw only the dark modules, inside a quiet zone", () => {
    const m = [
      [true, true, false],
      [false, true, false],
      [false, false, true],
    ];
    expect(qrSvgPath(m, 1)).toEqual({ d: "M1 1h2v1h-2zM2 2h1v1h-1zM3 3h1v1h-1z", size: 5 });
  });
});
