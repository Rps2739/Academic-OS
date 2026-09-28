import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { relativeTime } from "../lib/format";
import { GD_THEMES, isHttpUrl, listEntries, setDeleted, type GdPrepEntry, type PrepNote } from "../lib/gd-prep-store";
import {
  budgetLeft,
  DAILY_AI_BUDGET,
  GD_PREP_EVENT,
  generateNoteFor,
  isGeneratingNote,
  notifyGdPrepChanged,
  readGdPrepStatus,
  runGdPrepScan,
  type GdPrepStatus,
} from "../lib/gd-prep-loop";

interface GdPrepPanelProps {
  localDb: SqliteLocalDb;
  /** Link currently open in the reader panel, for the highlighted row. */
  openLink: string | null;
  onOpenArticle: (article: { title: string; link: string; source: string | null; published_at: string | null }) => void;
  onNotify: (message: string, undo: () => void) => void;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * GD Prep tab: a permanent, growing collection of GD/interview-worthy
 * stories, each with an AI prep note. Filled every 3 hours by gd-prep-loop.ts and
 * by NewsView's "Add to GD prep" button. Everything the model wrote is
 * rendered as plain text.
 */
export function GdPrepPanel({ localDb, openLink, onOpenArticle, onNotify }: GdPrepPanelProps) {
  const [entries, setEntries] = useState<GdPrepEntry[]>([]);
  const [theme, setTheme] = useState<string>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<GdPrepStatus | null>(() => readGdPrepStatus());
  const [checking, setChecking] = useState(false);

  async function reload() {
    setEntries(await listEntries(localDb));
    setStatus(readGdPrepStatus());
  }

  useEffect(() => {
    void reload();
    const onUpdate = () => void reload();
    window.addEventListener(GD_PREP_EVENT, onUpdate);
    return () => window.removeEventListener(GD_PREP_EVENT, onUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDb]);

  const groups = useMemo(() => {
    const visible = theme === "All" ? entries : entries.filter((e) => e.note?.theme === theme);
    const out: Array<{ label: string; items: GdPrepEntry[] }> = [];
    for (const e of visible) {
      const label = dayLabel(e.added_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [entries, theme]);

  async function checkNow() {
    setChecking(true);
    try {
      await runGdPrepScan(localDb);
    } finally {
      setChecking(false);
    }
  }

  async function remove(entry: GdPrepEntry) {
    await setDeleted(localDb, entry.id, true);
    notifyGdPrepChanged();
    onNotify("Removed from GD prep", async () => {
      await setDeleted(localDb, entry.id, false);
      notifyGdPrepChanged();
    });
  }

  async function generate(entry: GdPrepEntry) {
    const result = await generateNoteFor(localDb, entry);
    if (result === "rateLimited") onNotify("Gemini's daily limit was reached. Try again later.", () => {});
    else if (result === "budget") onNotify("Today's AI allowance for GD Prep is used up. Try again tomorrow.", () => {});
    else if (result === "failed") onNotify("Couldn't write the prep note. Try again.", () => {});
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const failed = status !== null && !status.ok;

  return (
    <div className="news-list gd-prep">
      <div className="gd-prep__status">
        <span className={`gd-prep__status-text ${failed ? "gd-prep__status-text--error" : ""}`}>
          {status ? `${status.message} · checked ${relativeTime(status.at)}` : "Not checked yet"}
          {` · ${budgetLeft()} of ${DAILY_AI_BUDGET} AI requests left today`}
        </span>
        <button className="btn btn--ghost btn--sm" disabled={checking || budgetLeft() === 0} onClick={() => void checkNow()}>
          <RefreshCw size={13} strokeWidth={2} className={checking ? "spin" : ""} /> {failed ? "Try again" : "Check now"}
        </button>
      </div>

      <div className="news-view__subtabs gd-prep__themes">
        {["All", ...GD_THEMES].map((t) => (
          <button
            key={t}
            className={`news-view__subtab ${theme === t ? "news-view__subtab--active" : ""}`}
            onClick={() => setTheme(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="news-view__empty">
          {entries.length === 0
            ? "No stories yet. GD-worthy news is added here automatically every few hours."
            : "No stories in this theme yet."}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="gd-prep__day">
            <h3 className="gd-prep__day-label">{g.label}</h3>
            {g.items.map((e) => {
              const open = expanded.has(e.id);
              const writing = isGeneratingNote(e.id);
              return (
                <div key={e.id} className={`news-item ${openLink === e.link ? "news-item--open" : ""}`}>
                  <div className="gd-prep__main">
                    <button className="news-item__body" onClick={() => onOpenArticle(e)}>
                      <div className="news-item__title-row">
                        <div className="news-item__title">{e.title}</div>
                        {e.note && <span className="gd-prep__theme">{e.note.theme}</span>}
                        {e.manual && <span className="gd-prep__badge">Manual</span>}
                      </div>
                      <div className="news-item__meta">
                        {e.source ?? "Unknown source"}
                        {e.published_at ? ` · ${relativeTime(e.published_at)}` : ""}
                      </div>
                    </button>
                    {e.note ? (
                      <>
                        <button className="gd-prep__toggle" aria-expanded={open} onClick={() => toggle(e.id)}>
                          <ChevronDown size={13} strokeWidth={2} className={open ? "gd-prep__chevron--open" : ""} />
                          {open ? "Hide prep note" : "Show prep note"}
                        </button>
                        {open && <PrepNoteView note={e.note} />}
                      </>
                    ) : (
                      <button
                        className="btn btn--ghost btn--sm gd-prep__generate"
                        disabled={writing}
                        onClick={() => void generate(e)}
                      >
                        <Sparkles size={13} strokeWidth={2} /> {writing ? "Writing prep note…" : "Generate prep note"}
                      </button>
                    )}
                  </div>
                  <div className="news-item__actions">
                    <button
                      className="icon-btn"
                      title="Open link"
                      onClick={() => {
                        if (isHttpUrl(e.link)) void openUrl(e.link);
                      }}
                    >
                      <ExternalLink size={14} strokeWidth={2} />
                    </button>
                    <button className="icon-btn" title="Remove from GD prep" onClick={() => void remove(e)}>
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}

function PrepNoteView({ note }: { note: PrepNote }) {
  return (
    <div className="gd-prep__note">
      <h4>Why it matters</h4>
      <p>{note.why}</p>
      <div className="gd-prep__sides">
        <div>
          <h4>For</h4>
          <ul>
            {note.pointsFor.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Against</h4>
          <ul>
            {note.pointsAgainst.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
      {note.keyFacts.length > 0 && (
        <>
          <h4>Key facts</h4>
          <ul>
            {note.keyFacts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </>
      )}
      <h4>Likely GD topic / interview question</h4>
      <p className="gd-prep__question">{note.question}</p>
      <p className="gd-prep__disclaimer">AI-generated. Verify facts before quoting.</p>
    </div>
  );
}
