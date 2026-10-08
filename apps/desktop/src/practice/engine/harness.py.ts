// Python helpers loaded into Pyodide once per engine start. Names start
// with _aos_ so they don't collide with learner code; `conn` and `load`
// are the two helpers learners use.
export const HARNESS = String.raw`
import sqlite3, csv, io, json, base64, os, sys
os.environ["MPLBACKEND"] = "AGG"

_aos_conn = None
_aos_pristine = None
_aos_tables = []
_aos_manifest = None

def _aos_conv(kind):
    def f(v):
        if v == "":
            return None
        if kind == "INTEGER":
            return int(v)
        if kind == "REAL":
            return float(v)
        return v
    return f

def _aos_seed(manifest_json):
    global _aos_conn, _aos_pristine, _aos_tables, _aos_manifest
    manifest = json.loads(manifest_json)
    base = sqlite3.connect(":memory:")
    for t in manifest["tables"]:
        cols = t["columns"]
        base.execute("CREATE TABLE " + t["name"] + " (" + ", ".join(c["name"] + " " + c["type"] for c in cols) + ")")
        conv = [_aos_conv(c["type"]) for c in cols]
        with open("/data/" + t["file"], newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader)
            rows = [tuple(fn(v) for fn, v in zip(conv, r)) for r in reader]
        base.executemany("INSERT INTO " + t["name"] + " VALUES (" + ",".join("?" * len(cols)) + ")", rows)
    base.commit()
    _aos_pristine = base
    _aos_manifest = manifest
    _aos_tables = [t["name"] for t in manifest["tables"]]
    _aos_reset()

def _aos_reset():
    global _aos_conn
    fresh = sqlite3.connect(":memory:")
    _aos_pristine.backup(fresh)
    _aos_conn = fresh

def _aos_copy():
    c = sqlite3.connect(":memory:")
    _aos_pristine.backup(c)
    return c

def load(name):
    """Return a dataset as a pandas DataFrame, e.g. load("orders")."""
    if name not in _aos_tables:
        raise ValueError("Unknown dataset " + repr(name) + ". Available: " + ", ".join(_aos_tables))
    import pandas as pd
    return pd.read_sql_query("SELECT * FROM " + name, _aos_conn)

def _aos_sql(query, conn=None, limit=None):
    conn = conn or _aos_conn
    cur = conn.cursor()
    last = None
    buf = ""
    def run(stmt):
        nonlocal last
        stmt = stmt.strip()
        if stmt.strip(";").strip():
            cur.execute(stmt)
            if cur.description:
                last = ([d[0] for d in cur.description], cur.fetchall())
    for line in query.splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            run(buf)
            buf = ""
    if buf.strip():
        run(buf)
    conn.commit()
    if last is None:
        return {"columns": [], "rows": [], "total": 0}
    cols, rows = last
    total = len(rows)
    if limit is not None:
        rows = rows[:limit]
    return {"columns": cols, "rows": [list(r) for r in rows], "total": total}

def _aos_run_sql(query):
    return json.dumps(_aos_sql(query, limit=200), default=str)

def _aos_sql_check(user_query, reference_query):
    expected = _aos_sql(reference_query, _aos_copy())
    user = _aos_sql(user_query, _aos_copy())
    return json.dumps({"user": user, "expected": expected}, default=str)

def _aos_describe(value):
    if value is None:
        return None, None
    pd = sys.modules.get("pandas")
    if pd is not None:
        try:
            if isinstance(value, pd.Series):
                value = value.to_frame()
            if isinstance(value, pd.DataFrame):
                df = value if isinstance(value.index, pd.RangeIndex) else value.reset_index()
                head = df.head(200).astype(object)
                head = head.where(head.notna(), None)
                return {"columns": [str(c) for c in head.columns], "rows": head.values.tolist(), "total": int(len(df))}, None
        except Exception:
            pass
    return None, repr(value)

def _aos_figures():
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return []
    out = []
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
        out.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return out

async def _aos_run_py(code, tests):
    from pyodide.code import eval_code_async
    ns = {"__name__": "__main__", "conn": _aos_conn, "load": load}
    try:
        value = await eval_code_async(code, ns, return_mode="last_expr")
        table, text = _aos_describe(value)
        test = None
        if tests:
            try:
                await eval_code_async(tests, ns)
                test = {"passed": True}
            except AssertionError as e:
                test = {"passed": False, "message": str(e) or "One of the checks failed."}
            except Exception as e:
                test = {"passed": False, "message": type(e).__name__ + ": " + str(e)}
        return json.dumps({"table": table, "value": text, "images": _aos_figures(), "test": test}, default=str)
    finally:
        plt = sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            plt.close("all")

def _aos_datasets():
    out = []
    for t in _aos_manifest["tables"]:
        out.append({"name": t["name"], "description": t["description"], "columns": t["columns"],
                    "sample": _aos_sql("SELECT * FROM " + t["name"] + " LIMIT 5", _aos_copy())})
    return json.dumps(out, default=str)
`;
