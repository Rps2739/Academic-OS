import { useEffect, useRef, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import { AuthGate } from "./components/AuthGate";
import { TreeSidebar } from "./components/TreeSidebar";
import { PageEditor } from "./components/PageEditor";
import { SqliteLocalDb } from "./lib/sqlite-local-db";
import { createSyncController } from "./lib/sync-loop";
import "./App.css";

function MainLayout({ userId }: { userId: string }) {
  const [localDb, setLocalDb] = useState<SqliteLocalDb | null>(null);
  const [selected, setSelected] = useState<LocalRow | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const startedRef = useRef(false);
  const syncRef = useRef<ReturnType<typeof createSyncController> | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void SqliteLocalDb.open().then(async (db) => {
      setLocalDb(db);
      const deviceId = await db.getOrCreateDeviceId();
      const controller = createSyncController(db, deviceId);
      syncRef.current = controller;
      controller.start();
    });
  }, []);

  function triggerSync() {
    syncRef.current?.triggerSync();
    setRefreshTick((t) => t + 1);
  }

  if (!localDb) {
    return <div className="app-loading">Starting local database…</div>;
  }

  return (
    <div className="app-layout">
      <TreeSidebar
        key={refreshTick /* re-fetch tree after a remote pull lands */}
        localDb={localDb}
        userId={userId}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        onChanged={triggerSync}
      />
      <main className="app-main">
        {selected && selected["kind"] === "page" ? (
          <PageEditor localDb={localDb} userId={userId} node={selected} onSaved={triggerSync} />
        ) : (
          <div className="app-main__empty">Select a page, or create one from the sidebar.</div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return <AuthGate>{(session) => <MainLayout userId={session.user.id} />}</AuthGate>;
}
