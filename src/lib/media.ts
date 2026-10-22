import "server-only";
import { isJpeg, stripJpegMetadata } from "./core";
import type { createClient } from "./supabase/server";
import type { Messages } from "@/messages";

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
export async function readUpload(
  value: FormDataEntryValue | null,
  m: Pick<Messages, "uploads">,
  opts: { allowPdf?: boolean } = {},
): Promise<Upload | { error: string } | null> {
  const u = m.uploads;
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_FILE_BYTES) return { error: u.tooBig };
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (isJpeg(bytes)) {
    try {
      return { bytes: stripJpegMetadata(bytes), contentType: "image/jpeg", extension: "jpg" };
    } catch {
      return { error: u.unreadable };
    }
  }
  if (opts.allowPdf && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return { bytes, contentType: "application/pdf", extension: "pdf" };
  return { error: opts.allowPdf ? u.photoOrPdf : u.photoOnly };
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
 * photo's small copy when there is one, otherwise the photo itself. Without,
 * the photo itself, or its small copy once the photo was archived (M49).
 */
export async function signedUrls(supabase: Supabase, paths: (string | null | undefined)[], opts: { small?: boolean } = {}): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;
  const photos = wanted.filter((p) => p.endsWith(".jpg"));
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls([...wanted, ...photos.map(smallPath)], 3600);
  if (error || !data) return out;
  const byPath = new Map(data.filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
  for (const p of wanted) {
    const url = opts.small ? (byPath.get(smallPath(p)) ?? byPath.get(p)) : (byPath.get(p) ?? byPath.get(smallPath(p)));
    if (url) out.set(p, url);
  }
  return out;
}
