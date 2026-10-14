"use client";

import { useEffect, useRef, useState } from "react";

const LONG_EDGE = 1600;
const SMALL_EDGE = 480;

/**
 * Choose or take photos. Each is redrawn in the browser before it is sent:
 * turned the right way up, shrunk to about 1,600 pixels on its long edge, and
 * saved as a JPEG, which also leaves behind the location and camera details
 * the phone wrote into it. A small copy for lists goes with it in a second,
 * hidden field (`{name}_small`). Without JavaScript the photo is sent as
 * taken, and the server still removes its hidden data.
 */
export function PhotoInput({ name, label, multiple = false, max = 4, accept = "image/*" }: { name: string; label: string; multiple?: boolean; max?: number; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const small = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");

  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function prepare(files: FileList) {
    const chosen = Array.from(files).slice(0, max);
    const photos = chosen.filter((f) => f.type.startsWith("image/"));
    // Certificates may be PDFs: those go as they are.
    if (photos.length === 0) {
      setPreviews([]);
      return;
    }
    setStatus("working");
    try {
      const full = new DataTransfer();
      const tiny = new DataTransfer();
      const urls: string[] = [];
      for (const [i, file] of chosen.entries()) {
        if (!file.type.startsWith("image/")) {
          full.items.add(file);
          continue;
        }
        const big = await redraw(file, LONG_EDGE, 0.82, `photo-${i + 1}.jpg`);
        full.items.add(big);
        tiny.items.add(await redraw(file, SMALL_EDGE, 0.75, `photo-${i + 1}.small.jpg`));
        urls.push(URL.createObjectURL(big));
      }
      if (input.current) input.current.files = full.files;
      if (small.current) small.current.files = tiny.files;
      setPreviews(urls);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div>
      <label className="block">
        <span className="mb-1 block font-semibold">{label}</span>
        <input
          ref={input}
          type="file"
          name={name}
          accept={accept}
          multiple={multiple}
          onChange={(e) => e.currentTarget.files && prepare(e.currentTarget.files)}
          className="block min-h-12 w-full rounded-lg border-2 border-dashed border-rule bg-paper px-3 py-3 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-ink file:px-3 file:font-semibold file:text-paper"
        />
      </label>
      <input ref={small} type="file" name={`${name}_small`} multiple hidden tabIndex={-1} aria-hidden="true" />
      <p aria-live="polite" className="mt-1 text-sm text-slate">
        {status === "working" ? "Getting the photos ready…" : status === "error" ? "A photo could not be prepared. Try another, or take it with the camera." : multiple ? `Up to ${max}.` : ""}
      </p>
      {previews.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {previews.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of a file not yet uploaded
            <img key={u} src={u} alt="" className="size-20 rounded-lg object-cover" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Draw a photo onto a canvas at a size, the right way up, and save it as a JPEG with no hidden data. */
async function redraw(file: File, longEdge: number, quality: number, name: string): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("could not encode");
  return new File([blob], name, { type: "image/jpeg" });
}
