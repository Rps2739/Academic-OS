import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import JSZip from "jszip";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Matches text runs (<a:t>...</a:t>) inside a slideN.xml part of a .pptx. */
const SLIDE_TEXT_RUN = /<a:t>([^<]*)<\/a:t>/g;

async function extractPptxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  const slideTexts: string[] = [];
  for (const name of slideFiles) {
    const entry = zip.files[name];
    if (!entry) continue;
    const xml = await entry.async("text");
    const runs = [...xml.matchAll(SLIDE_TEXT_RUN)].map((m) => m[1]);
    slideTexts.push(runs.join(" "));
  }
  return slideTexts.join("\n\n");
}

/**
 * Extracts plain text from an attachment's bytes for full-text search
 * (design manual §1.7/§1.8). Returns null for mime types with no text
 * extraction path (images, spreadsheets, ...) — OCR for images is a
 * separate, later feature (§5.4), not this one.
 */
export async function extractAttachmentText(
  mime: string | null,
  bytes: Uint8Array
): Promise<string | null> {
  if (!mime) return null;

  try {
    if (mime === PDF_MIME) {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractPdfText(pdf, { mergePages: true });
      return text.trim() || null;
    }
    if (mime === DOCX_MIME) {
      // Copy into a fresh ArrayBuffer, not `.buffer` directly — bytes may
      // be a view with a nonzero offset into a larger underlying buffer,
      // and `.buffer` is typed as possibly-SharedArrayBuffer.
      const arrayBuffer = bytes.slice().buffer;
      const { value } = await mammoth.extractRawText({ arrayBuffer });
      return value.trim() || null;
    }
    if (mime === PPTX_MIME) {
      const text = await extractPptxText(bytes);
      return text.trim() || null;
    }
  } catch {
    // A malformed or unsupported file shouldn't block the upload itself —
    // the attachment is still saved, it just won't be full-text searchable.
    return null;
  }
  return null;
}
