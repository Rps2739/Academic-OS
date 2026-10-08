import type { RunResult } from "../../practice/engine/protocol";
import type { TableData } from "../../practice/check";

export function DataTable({ table }: { table: TableData }) {
  if (table.columns.length === 0) return <p className="practice-result__note">Done — no rows returned.</p>;
  return (
    <div className="practice-table-wrap">
      <table className="practice-table">
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={v === null ? "is-null" : undefined}>
                  {v === null ? "NULL" : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.total > table.rows.length && (
        <p className="practice-result__note">
          Showing {table.rows.length} of {table.total} rows.
        </p>
      )}
    </div>
  );
}

export function ResultView({ result }: { result: RunResult }) {
  return (
    <div className="practice-result">
      {result.error && <pre className="practice-result__error">{result.error}</pre>}
      {result.stdout && <pre className="practice-result__out">{result.stdout}</pre>}
      {result.stderr && <pre className="practice-result__err">{result.stderr}</pre>}
      {result.table && <DataTable table={result.table} />}
      {result.value && <pre className="practice-result__out">{result.value}</pre>}
      {result.images.map((src, i) => (
        <img key={i} className="practice-result__chart" src={src} alt={`Chart ${i + 1}`} />
      ))}
    </div>
  );
}
