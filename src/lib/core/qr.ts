import qrcode from "qrcode-generator";

/**
 * QR codes for UPI pay links, drawn by Wagbook itself. No third-party image
 * service ever sees a bill's payment details (docs/07-whatsapp-and-upi.md).
 * The encoding is done by qrcode-generator (no dependencies of its own; see
 * docs/09-decisions.md, D17). This file only turns it into something a page
 * can draw.
 */

/** Dark (true) and light modules, row by row, without the quiet zone. */
export function qrMatrix(text: string): boolean[][] {
  // Level M survives a creased or smudged print and keeps UPI links small.
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => qr.isDark(row, col)));
}

/**
 * One SVG path drawing every dark module, with `quiet` light modules of
 * margin on each side (scanners need at least four). Runs of dark modules in
 * a row become one rectangle, which keeps the path short.
 */
export function qrSvgPath(matrix: boolean[][], quiet = 4): { d: string; size: number } {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < row.length && row[end + 1]) end++;
      parts.push(`M${x + quiet} ${y + quiet}h${end - x + 1}v1h-${end - x + 1}z`);
      x = end;
    }
  });
  return { d: parts.join(""), size: matrix.length + quiet * 2 };
}
