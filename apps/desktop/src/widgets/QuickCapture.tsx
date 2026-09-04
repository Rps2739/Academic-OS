import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWidgetData } from "./useWidgetData";

/**
 * Opened by Ctrl+Alt+N (design manual §2.6) — a tiny always-on-top
 * capture box. Enter saves it as an uncategorized task (the Inbox is
 * just "no category yet", same concept as the Tasks view's grouping)
 * and closes the window; Escape discards and closes.
 */
export function QuickCapture() {
  const { userId, localDb } = useWidgetData();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function save() {
    const title = value.trim();
    if (!title || !localDb || !userId) {
      await getCurrentWindow().close();
      return;
    }
    setSaving(true);
    await localDb.put("tasks", {
      id: crypto.randomUUID(),
      user_id: userId,
      title,
      notes: null,
      due_at: null,
      status: "open",
      priority: 0,
      completed_at: null,
      sort_order: Date.now(),
      node_id: null,
      project_id: null,
    });
    await getCurrentWindow().close();
  }

  return (
    <div className="widget-panel widget-panel--capture">
      <input
        ref={inputRef}
        className="quick-capture__input"
        placeholder={saving ? "Saving…" : "Quick capture — Enter to save, Esc to cancel"}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") void getCurrentWindow().close();
        }}
      />
    </div>
  );
}
