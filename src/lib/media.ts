import "server-only";
import { isJpeg, stripJpegMetadata } from "./core";
import type { createClient } from "./supabase/server";

/**
 * Files in the pet-media bucket: photos and certificates.
 *
 * Paths follow supabase/migrations/20261008000900_storage.sql: the first
 * folder is the organisation, which is what the storage policies check.
 * Every photo is kept twice: the photo (long edge about 1,600 pixels) and a
 * small copy (name.small.jpg) for lists and slow connections. The browser
 * makes both (src/components/photo-input.tsx); without JavaScript only the
 * photo arrives and lists fall back to it.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const BUCKET = "pet-media";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface Upload {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "application/pdf";
  extension: "jpg" | "pdf";
}

/**
 * Read one uploaded file: a JPEG, cleaned of its hidden location data, or (when
 * allowed) a PDF. Anything else is refused with a sentence for the person.
 * Returns null when no file was chosen.
 */
export async function readUpload(value: FormDataEntryValue | null, opts: { allowPdf?: boolean } = {}): Promise<Upload | { error: string } | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_FILE_BYTES) return { error: "That file is over 10 MB. Choose a smaller one." };
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (isJpeg(bytes)) {
    try {
      return { bytes: stripJpegMetadata(bytes), contentType: "image/jpeg", extension: "jpg" };
    } catch {
      return { error: "That photo could not be read. Try taking it again." };
    }
  }
  if (opts.allowPdf && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return { bytes, contentType: "application/pdf", extension: "pdf" };
  return { error: opts.allowPdf ? "Choose a photo or a PDF." : "Choose a photo. If your phone saves photos in another format, take it with the camera button." };
}

/** Store a file. Staff may add files but never replace one, so every path is new. */
export async function store(supabase: Supabase, path: string, upload: Upload) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, upload.bytes, { contentType: upload.contentType, upsert: false });
  return error;
}

/** The small copy of a photo. */
export function smallPath(path: string): string {
  return path.replace(/\.jpg$/, ".small.jpg");
}

/**
 * Short-lived links (an hour) to show files on a page. With `small`, each
 * photo's small copy when there is one, otherwise the photo itself.
 */
export async function signedUrls(supabase: Supabase, paths: (string | null | undefined)[], opts: { small?: boolean } = {}): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;
  const ask = opts.small ? [...wanted.map(smallPath), ...wanted] : wanted;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(ask, 3600);
  if (error || !data) return out;
  const byPath = new Map(data.filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
  for (const p of wanted) {
    const url = (opts.small ? byPath.get(smallPath(p)) : undefined) ?? byPath.get(p);
    if (url) out.set(p, url);
  }
  return out;
}
