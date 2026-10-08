import { useEffect, useState } from "react";
import type { DatasetInfo } from "../../practice/engine/protocol";
import { engine } from "../../practice/engine/client";
import { DataTable } from "./ResultView";

export function DatasetsPanel() {
  const [data, setData] = useState<DatasetInfo[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    engine.datasets().then(setData, (e: Error) => setError(e.message));
  }, []);
  if (error) return <p className="practice-result__error">{error}</p>;
  if (!data) return <p className="practice-muted">Loading datasets…</p>;
  return (
    <div className="datasets">
      <p className="practice-muted">
        Bharat Retail is an invented Indian e-commerce company — all data is synthetic. In SQL, query the tables by name. In Python, use <code>load("orders")</code> to get a pandas DataFrame, or <code>conn</code> for raw SQL. scikit-learn's own datasets (<code>load_iris</code>, <code>load_wine</code>, <code>load_diabetes</code>, <code>load_breast_cancer</code>) also work offline.
      </p>
      {data.map((d) => (
        <section key={d.name} className="dataset">
          <h3>{d.name}</h3>
          <p className="practice-muted">{d.description}</p>
          <p className="dataset__cols">{d.columns.map((c) => `${c.name} (${c.type.toLowerCase()})`).join(" · ")}</p>
          <DataTable table={d.sample} />
        </section>
      ))}
    </div>
  );
}
