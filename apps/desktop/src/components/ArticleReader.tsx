import { useEffect, useState } from "react";
import { X as XIcon, ExternalLink, AlertCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { supabase } from "../lib/supabase";
import { relativeTime } from "../lib/format";

interface ArticleBlock {
  type: "p" | "h" | "quote" | "li" | "caption";
  text: string;
}

interface ExtractedArticle {
  title: string;
  byline: string | null;
  blocks: ArticleBlock[];
}

export interface ReaderArticle {
  title: string;
  link: string;
  source: string | null;
  published_at: string | null;
}

interface ArticleReaderProps {
  article: ReaderArticle;
  onClose: () => void;
}

/** Feed/extraction content is untrusted input from the public internet —
 * never hand a raw link straight to the OS without validating its scheme. */
function safeExternalUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function ArticleReader({ article, onClose }: ArticleReaderProps) {
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [extracted, setExtracted] = useState<ExtractedArticle | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setExtracted(null);

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("article-reader", {
          body: { url: article.link },
        });
        if (cancelled) return;
        if (error) throw error;
        if (!data?.article) {
          setState("empty");
          return;
        }
        setExtracted(data.article as ExtractedArticle);
        setState("ok");
      } catch (err) {
        if (cancelled) return;
        console.error("article-reader failed:", err);
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [article.link]);

  function openOriginal() {
    const safe = safeExternalUrl(article.link);
    if (safe) void openUrl(safe);
  }

  return (
    <div className="article-reader">
      <div className="article-reader__head">
        <button className="btn btn--ghost btn--sm" onClick={openOriginal}>
          <ExternalLink size={13} strokeWidth={2} /> Open original
        </button>
        <button className="icon-btn" title="Close" onClick={onClose}>
          <XIcon size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="article-reader__body">
        <h1 className="article-reader__title">{extracted?.title || article.title}</h1>
        <div className="article-reader__meta">
          {extracted?.byline ? `${extracted.byline} · ` : ""}
          {article.source ?? "Unknown source"}
          {article.published_at ? ` · ${relativeTime(article.published_at)}` : ""}
        </div>

        {state === "loading" && (
          <div className="article-reader__status">
            <span className="spinner" aria-hidden /> Loading article…
          </div>
        )}

        {(state === "empty" || state === "error") && (
          <div className="article-reader__status article-reader__status--fallback">
            <AlertCircle size={16} strokeWidth={2} />
            <span>
              {state === "error"
                ? "Couldn't load this article."
                : "Couldn't extract a readable version of this article."}
              {" "}Open it in your browser instead.
            </span>
            <button className="btn btn--primary btn--sm" onClick={openOriginal}>
              <ExternalLink size={13} strokeWidth={2} /> Open original
            </button>
          </div>
        )}

        {state === "ok" && extracted && (
          <div className="article-reader__content">
            {extracted.blocks.map((block, i) => {
              if (block.type === "h") return <h3 key={i}>{block.text}</h3>;
              if (block.type === "quote") return <blockquote key={i}>{block.text}</blockquote>;
              if (block.type === "li") return <li key={i}>{block.text}</li>;
              if (block.type === "caption") return <figcaption key={i}>{block.text}</figcaption>;
              return <p key={i}>{block.text}</p>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
