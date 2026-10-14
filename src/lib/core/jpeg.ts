/**
 * Removing hidden data from photos before they are stored.
 *
 * A phone camera writes where and when a photo was taken into the file (EXIF,
 * in an APP1 segment, and sometimes XMP and IPTC). A kennel's photos must not
 * carry the kennel's or a parent's location to whoever sees them. The browser
 * already re-draws every photo through a canvas, which drops all of this; this
 * is the server's second line, for a photo that arrived some other way.
 */

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;

/** Segments kept: JFIF (APP0), the colour profile (APP2) and Adobe's colour flag (APP14). Everything else that is metadata goes. */
function isMetadata(marker: number): boolean {
  if (marker === 0xfe) return true; // COM: comments
  if (marker < 0xe0 || marker > 0xef) return false; // not an APPn segment
  return marker !== 0xe0 && marker !== 0xe2 && marker !== 0xee;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === SOI && bytes[2] === 0xff;
}

/**
 * The same JPEG without its metadata segments (location, camera, comments).
 * Throws when the file is not a well-formed JPEG, so a damaged or disguised
 * file is refused rather than stored half-cleaned.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (!isJpeg(bytes)) throw new RangeError("not a JPEG file");
  const out: number[] = [0xff, SOI];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new RangeError("damaged JPEG: expected a marker");
    // Fill bytes: any number of 0xFF before a marker.
    while (bytes[i] === 0xff && i < bytes.length) i++;
    const marker = bytes[i];
    i++;
    if (marker === EOI) {
      out.push(0xff, EOI);
      return Uint8Array.from(out);
    }
    // Markers with no length: restart markers and TEM.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(0xff, marker);
      continue;
    }
    if (i + 1 >= bytes.length) throw new RangeError("damaged JPEG: segment cut short");
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) throw new RangeError("damaged JPEG: bad segment length");
    if (!isMetadata(marker)) {
      out.push(0xff, marker);
      for (let j = i; j < i + length; j++) out.push(bytes[j]);
    }
    i += length;
    if (marker === SOS) {
      // The picture itself follows, up to the end. It holds no metadata.
      for (let j = i; j < bytes.length; j++) out.push(bytes[j]);
      return Uint8Array.from(out);
    }
  }
  throw new RangeError("damaged JPEG: no picture data");
}
