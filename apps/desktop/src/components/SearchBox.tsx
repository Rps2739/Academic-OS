import { useEffect, useRef, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { Search, Folder, FileText } from "lucide-react";

interface SearchResult {
  node: LocalRow;
  snippet: string;
}

interface SearchBoxProps {
  localDb: SqliteLocalDb;
  onSelect: (node: LocalRow) => void;
}

/** A short excerpt centered on the first match, for context in the results list. */
function snippetAround(text: string, query: string, radius = 60): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

/**
 * Full-text search across page content and attachment text (design manual
 * §1.8) — a plain LIKE scan, not FTS5. At personal scale (hundreds of
 * pages, not millions) this is fast enough and needs no virtual-table
 * upkeep; the remote Postgres mirror has the real GIN index if this ever
 * needs to scale beyond one device's local search.
 */
export function SearchBox({ localDb, onSelect }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  function onQueryChange(q: string) {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void runSearch(q), 160);
  }

  async function runSearch(q: string) {
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const like = `%${q}%`;

    // Title matches first — the most common thing a person searches for
    // is the name of a page or folder, which the body/attachment scans
    // below never covered on their own.
    const titleRows = await localDb.raw.select<Array<Record<string, unknown>>>(
      `SELECT n.*, '' AS __snippet
       FROM nodes n
       WHERE n.title LIKE $1 AND n.deleted_at IS NULL
       LIMIT 20`,
      [like]
    );
    const pageRows = await localDb.raw.select<Array<Record<string, unknown>>>(
      `SELECT n.*, pb.plaintext AS __snippet
       FROM nodes n JOIN page_bodies pb ON pb.node_id = n.id
       WHERE pb.plaintext LIKE $1 AND n.deleted_at IS NULL
       LIMIT 20`,
      [like]
    );
    const attachmentRows = await localDb.raw.select<Array<Record<string, unknown>>>(
      `SELECT n.*, a.extracted_text AS __snippet
       FROM nodes n JOIN attachments a ON a.node_id = n.id
       WHERE a.extracted_text LIKE $1 AND n.deleted_at IS NULL AND a.deleted_at IS NULL
       LIMIT 20`,
      [like]
    );

    // A node can match on title AND body AND an attachment — collapse to
    // one result per node, keeping the first (title-first ordering above
    // means a title hit wins, with a body snippet if there was one).
    const byId = new Map<string, SearchResult>();
    for (const r of [...titleRows, ...pageRows, ...attachmentRows]) {
      const { __snippet, ...node } = r;
      const id = node["id"] as string;
      const snippetText = String(__snippet ?? "");
      if (!byId.has(id)) {
        byId.set(id, { node: node as LocalRow, snippet: snippetText ? snippetAround(snippetText, q) : "" });
      } else if (snippetText && !byId.get(id)!.snippet) {
        byId.get(id)!.snippet = snippetAround(snippetText, q);
      }
    }
    setResults([...byId.values()]);
    setSearching(false);
  }

  return (
    <div className="search-box">
      <div className="search-box__field">
        <Search size={14} strokeWidth={2} />
        <input
          type="search"
          className="search-box__input"
          placeholder="Search notes and files…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      {query.trim().length >= 2 && (
        <ul className="search-box__results">
          {searching && (
            <li className="search-box__empty">
              <span className="spinner" aria-hidden /> Searching…
            </li>
          )}
          {!searching && results.length === 0 && <li className="search-box__empty">No matches.</li>}
          {results.map((r) => (
            <li
              key={r.node.id as string}
              className="search-box__result"
              onClick={() => {
                onSelect(r.node);
                setQuery("");
                setResults([]);
              }}
            >
              <div className="search-box__result-title">
                {r.node["kind"] === "page" ? (
                  <FileText size={13} strokeWidth={2} />
                ) : (
                  <Folder size={13} strokeWidth={2} />
                )}
                {r.node["title"] as string}
              </div>
              {r.snippet && <div className="search-box__result-snippet">{r.snippet}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
