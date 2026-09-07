// Server-side "reader mode" extraction, isolated in its own module so the
// parsing library choice can change without touching the dispatcher. Runs
// entirely server-side (Deno Edge Function) — the desktop app's CSP blocks
// it from fetching arbitrary article HTML directly, and even without that,
// rendering third-party HTML in the client would need a sanitiser this app
// deliberately doesn't carry (see the news-fetch "no dangerouslySetInnerHTML
// for feed content" rule). Structured plain-text blocks solve both problems
// at once: nothing but plain strings ever reaches the client.
//
// Two npm-originated DOM libraries were tried and rejected before this one,
// both for the same root cause — a transitive dependency on a native Node
// addon that Deno Edge Functions' sandbox cannot load, no matter the
// version pinned:
//   - linkedom: HTMLCanvasElement support unconditionally imports the
//     native `canvas` package. esm.sh's CJS->ESM transform turns linkedom's
//     own internal try/catch fallback into a static top-level `import`,
//     which is resolved at bundle time regardless of the try/catch
//     ("Module not found... canvas.node").
//   - happy-dom: hits `Unknown built-in "node:" module: vm` at Supabase's
//     bundle step, and separately pulls in `ws` -> `node-gyp-build` (native
//     binary loader) if that code path is ever reached.
// deno_dom is Deno's own WASM-compiled HTML parser, built specifically to
// avoid this whole class of problem — zero Node/native dependencies. It's
// also a pure parser with no script-execution engine at all (unlike
// happy-dom, which has JS eval to explicitly disable) — there is nothing
// in third-party article HTML that can ever execute here.
// Verified end-to-end against real articles (The Hindu, TechCrunch, The
// Verge) with a local Deno runtime before deploying: identical extraction
// quality to both rejected libraries, and confirmed to actually bundle and
// run in this environment.
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.56/deno-dom-wasm.ts";
import { Readability } from "https://esm.sh/@mozilla/readability@0.6.0";
import { safeFetch } from "../_shared/url-safety.ts";

export interface ArticleBlock {
  type: "p" | "h" | "quote" | "li" | "caption";
  text: string;
}

export interface ExtractedArticle {
  title: string;
  byline: string | null;
  blocks: ArticleBlock[];
}

const BLOCK_TAGS: Record<string, ArticleBlock["type"]> = {
  P: "p",
  H1: "h",
  H2: "h",
  H3: "h",
  H4: "h",
  BLOCKQUOTE: "quote",
  LI: "li",
  FIGCAPTION: "caption",
};
// Containers we recurse into looking for block tags, without emitting a
// block for the container itself.
const CONTAINER_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "UL", "OL", "FIGURE", "MAIN"]);

function extractBlocks(contentHtml: string): ArticleBlock[] {
  const doc = new DOMParser().parseFromString(`<div id="root">${contentHtml}</div>`, "text/html");
  const root = doc?.getElementById("root");
  const blocks: ArticleBlock[] = [];

  function walk(node: Element) {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName;
      const blockType = BLOCK_TAGS[tag];
      if (blockType) {
        const text = child.textContent?.trim().replace(/\s+/g, " ") ?? "";
        if (text) blocks.push({ type: blockType, text });
      } else if (CONTAINER_TAGS.has(tag)) {
        walk(child);
      }
    }
  }
  if (root) walk(root);
  return blocks;
}

const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 8 * 1024 * 1024; // 8MB — generous for an article page, guards against a pathological response

export async function extractArticle(url: string): Promise<ExtractedArticle | null> {
  // safeFetch re-validates every redirect hop, not just the starting URL —
  // a plain fetch() would follow a 3xx from an otherwise-safe public URL
  // straight to a private/internal address without any further check.
  const res = await safeFetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 AcademicOS/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_HTML_BYTES) {
    throw new Error("Article page too large to extract");
  }
  const html = await res.text();
  if (html.length > MAX_HTML_BYTES) throw new Error("Article page too large to extract");

  // res.url reflects the final URL actually reached, in case redirects
  // happened — Readability needs the real base URL to resolve relative links.
  const finalUrl = res.url || url;
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return null;

  // deno-lint-ignore no-explicit-any
  const reader = new (Readability as any)(doc, { url: finalUrl });
  const article = reader.parse();
  if (!article) return null;

  const blocks = extractBlocks(article.content ?? "");
  if (blocks.length === 0) return null;

  return {
    title: article.title ?? "",
    byline: article.byline ?? null,
    blocks,
  };
}
