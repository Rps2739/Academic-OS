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

    // Widget windows open independently of the main window and may
    // already be open when sign-in completes there — without this,
    // a widget that captured "signed out" at mount would show that
    // forever, since Supabase's client shares session state across
    // windows via localStorage but only pushes updates through this
    // subscription, not the one-time getSession() call above.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return { userId, localDb, loading: userId === undefined || localDb === null };
}
