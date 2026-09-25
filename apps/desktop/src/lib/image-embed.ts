// Pasted/dropped images are stored inline in the note's own block JSON as
// data: URLs, rather than uploaded somewhere and referenced by URL:
//  - CSP img-src only allows 'self' data: blob: and Supabase — an external
//    https image (e.g. the src of an <img> copied from a website) can't
//    render at all, and widening img-src would let every pasted note fetch
//    third-party tracking pixels.
//  - Drive (where attachments live) needs the Google token to render, and
//    that token expiring once already took every Google feature down at
//    the same time. Inline images keep working offline and sync with the
//    note like any other content.
// The cost is row size, so rasters are downscaled and re-encoded first.

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.85;
// GIF (animation would be lost by a canvas re-encode) and SVG pass through
// untouched, so they get a hard cap instead.
const MAX_PASSTHROUGH_BYTES = 3 * 1024 * 1024;
const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/bmp"]);

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!RASTER_TYPES.has(file.type)) {
    if (file.size > MAX_PASSTHROUGH_BYTES) {
      throw new Error(`"${file.name}" is too large to embed in a note (max 3 MB for this image type).`);
    }
    return readAsDataUrl(file);
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
  // A small, already-compact image can come out larger after re-encoding —
  // keep the original then, unless it had to be downscaled.
  const chosen = encoded && (scale < 1 || encoded.size < file.size) ? encoded : file;
  return readAsDataUrl(chosen);
}

/** Browsers' "Copy image" puts the image file AND an <img src="https://…">
 * HTML snippet on the clipboard, and BlockNote prefers the HTML — which
 * produces a block pointing at an external URL CSP blocks from loading.
 * Only prefer the file when the HTML is nothing but image(s): Excel (and
 * sometimes Word) also put a rendered-preview image next to real table/
 * text HTML, and that must still paste as the table, not a picture of it. */
export function isImageOnlyHtml(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, "text/html"); // inert — loads nothing
  return !!doc.querySelector("img") && (doc.body.textContent ?? "").trim() === "";
}

/** blocksToMarkdownLossy writes embedded images as ![name](data:…), which
 * would copy every image's full base64 into the markdown AND plaintext
 * (search) columns too. Keep a readable placeholder instead. */
export function stripEmbeddedImages(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(data:[^)\s]*\)/g, "![$1](embedded image)");
}
