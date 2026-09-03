import { useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";

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

  async function runSearch(q: string) {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const like = `%${q}%`;

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

    const merged = [...pageRows, ...attachmentRows].map((r) => {
      const { __snippet, ...node } = r;
      return { node: node as LocalRow, snippet: snippetAround(String(__snippet ?? ""), q) };
    });
    setResults(merged);
    setSearching(false);
  }

  return (
    <div className="search-box">
      <input
        type="search"
        className="search-box__input"
        placeholder="Search notes and files…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          void runSearch(e.target.value);
        }}
      />
      {query.trim().length >= 2 && (
        <ul className="search-box__results">
          {searching && <li className="search-box__empty">Searching…</li>}
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
                {r.node["kind"] === "page" ? "📄" : "📁"} {r.node["title"] as string}
              </div>
              <div className="search-box__result-snippet">{r.snippet}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
