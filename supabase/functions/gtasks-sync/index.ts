// Two-way sync between our `tasks` table and a dedicated Google Tasks
// list ("Academic OS", created on first run). Runs against Postgres
// directly, using the CALLER's own JWT (not service role) so RLS scopes
// everything to their own rows automatically — the existing local <->
// Postgres sync engine (packages/core/src/sync) then carries whatever
// this writes down to the desktop app's SQLite mirror on its own next
// pull, so no client-side schema or sync-engine changes were needed for
// this feature at all.
//
// What syncs: title, notes, due date (date only — Google Tasks ignores
// time-of-day on `due`), and open/done status. What doesn't: priority
// and category — Google Tasks has no equivalent concept for either.
// Conflict rule: last-write-wins by timestamp, same as page edits
// (design manual §7) — a personal, single-user task list makes a
// genuine concurrent edit on both sides at once vanishingly unlikely.
//
// Known limitation: only the first 100 tasks in the Google list are
// read per sync (no pagination) — fine at personal scale, revisit if
// it ever matters.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { corsHeaders } from "../_shared/cors.ts";
import { getGoogleAccessToken } from "../_shared/google-oauth.ts";

const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

interface GTask {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
  updated?: string;
  deleted?: boolean;
  hidden?: boolean;
}

interface LocalTask {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  status: string;
  deleted_at: string | null;
  google_task_id: string | null;
  updated_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated");

    const accessToken = await getGoogleAccessToken();
    const gHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    // 1. Find or create the dedicated tasklist.
    const { data: settings } = await supabase
      .from("user_settings")
      .select("gtasks_list_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let listId = settings?.gtasks_list_id as string | undefined;
    if (!listId) {
      const createRes = await fetch(`${TASKS_API}/users/@me/lists`, {
        method: "POST",
        headers: gHeaders,
        body: JSON.stringify({ title: "Academic OS" }),
      });
      if (!createRes.ok) throw new Error(`Failed to create tasklist: ${await createRes.text()}`);
      const list = await createRes.json();
      listId = list.id as string;
      await supabase.from("user_settings").upsert({ user_id: user.id, gtasks_list_id: listId });
    }

    const { data: localTasksData, error: localErr } = await supabase
      .from("tasks")
      .select("id, title, notes, due_at, status, deleted_at, google_task_id, updated_at");
    if (localErr) throw localErr;
    const localTasks = (localTasksData ?? []) as LocalTask[];

    // 2. Push: local -> Google. Every active mapped task is re-sent each
    // round rather than diffed — simpler, and a no-op PATCH is cheap at
    // this scale.
    for (const task of localTasks) {
      if (task.deleted_at) {
        if (task.google_task_id) {
          await fetch(`${TASKS_API}/lists/${listId}/tasks/${task.google_task_id}`, {
            method: "DELETE",
            headers: gHeaders,
          }).catch(() => {}); // already gone on Google's side is fine
        }
        continue;
      }

      const body = {
        title: task.title,
        notes: task.notes ?? undefined,
        status: task.status === "done" ? "completed" : "needsAction",
        due: task.due_at ? new Date(task.due_at).toISOString() : undefined,
      };

      if (task.google_task_id) {
        await fetch(`${TASKS_API}/lists/${listId}/tasks/${task.google_task_id}`, {
          method: "PATCH",
          headers: gHeaders,
          body: JSON.stringify(body),
        });
      } else {
        const insertRes = await fetch(`${TASKS_API}/lists/${listId}/tasks`, {
          method: "POST",
          headers: gHeaders,
          body: JSON.stringify(body),
        });
        if (insertRes.ok) {
          const created = (await insertRes.json()) as GTask;
          await supabase.from("tasks").update({ google_task_id: created.id }).eq("id", task.id);
        }
      }
    }

    // 3. Pull: Google -> local.
    const listRes = await fetch(`${TASKS_API}/lists/${listId}/tasks?showCompleted=true&showHidden=true&maxResults=100`, {
      headers: gHeaders,
    });
    if (!listRes.ok) throw new Error(`Failed to list Google Tasks: ${await listRes.text()}`);
    const { items } = (await listRes.json()) as { items?: GTask[] };
    const googleTasks = (items ?? []).filter((g) => !g.deleted && !g.hidden);

    const localByGoogleId = new Map(
      localTasks.filter((t) => t.google_task_id).map((t) => [t.google_task_id as string, t])
    );

    for (const gtask of googleTasks) {
      const existing = localByGoogleId.get(gtask.id);
      const status = gtask.status === "completed" ? "done" : "open";
      const dueAt = gtask.due ?? null;

      if (!existing) {
        // Created directly in the Google Tasks app — mirror it locally.
        await supabase.from("tasks").insert({
          user_id: user.id,
          title: gtask.title || "Untitled",
          notes: gtask.notes ?? null,
          due_at: dueAt,
          status,
          priority: 0,
          sort_order: 0,
          node_id: null,
          project_id: null,
          google_task_id: gtask.id,
        });
        continue;
      }

      if (existing.deleted_at) continue; // about to be deleted on Google's side too, below

      // Only apply Google's version if it's actually newer than what we
      // just pushed above — otherwise this is just Google echoing back
      // the write we made a moment ago.
      const googleUpdated = gtask.updated ? new Date(gtask.updated).getTime() : 0;
      const localUpdated = new Date(existing.updated_at).getTime();
      if (googleUpdated > localUpdated + 5000) {
        await supabase
          .from("tasks")
          .update({ title: gtask.title || existing.title, notes: gtask.notes ?? null, due_at: dueAt, status })
          .eq("id", existing.id);
      }
    }

    // 4. A local task previously mapped to a Google task that no longer
    // exists there (deleted from the Google Tasks app) gets soft-deleted
    // here too — this is what makes it a real two-way sync.
    const currentGoogleIds = new Set(googleTasks.map((g) => g.id));
    for (const task of localTasks) {
      if (task.google_task_id && !task.deleted_at && !currentGoogleIds.has(task.google_task_id)) {
        await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", task.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, pushed: localTasks.length, pulled: googleTasks.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
