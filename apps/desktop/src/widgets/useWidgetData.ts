import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { SqliteLocalDb } from "../lib/sqlite-local-db";

/**
 * Lightweight session + local-db access for widget windows — no sign-in
 * UI (that's the main window's job; widgets just read whatever session
 * already exists) and no sync controller (the main window owns that;
 * widgets read the same local SQLite mirror it keeps fresh).
 */
export function useWidgetData() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [localDb, setLocalDb] = useState<SqliteLocalDb | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    void SqliteLocalDb.open().then(setLocalDb);
  }, []);

  return { userId, localDb, loading: userId === undefined || localDb === null };
}
