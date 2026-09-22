// Two-way sync between our `tasks` table and Google Tasks. Runs against
// Postgres directly, using the CALLER's own JWT (not service role) so
// RLS scopes everything to their own rows automatically — the existing
// local <-> Postgres sync engine (packages/core/src/sync) then carries
// whatever this writes down to the desktop app's SQLite mirror on its
// own next pull, so no client-side schema or sync-engine changes were
// needed for this feature at all.
//
// Each task category (a folder node) gets its OWN Google Tasks list —
// "Academic OS — SIBM", "Academic OS — Personal" — rather than a prefix
// jammed into every task title, matching how Google Tasks itself
// organizes things (Lists, not tags). Uncategorized tasks live in the
// plain "Academic OS" default list. A task whose category changes gets
// deleted from its old Google list and recreated in the new one — the
// Tasks API has no cross-list move, only same-list reordering.
//
// What syncs: title, notes, due date (date only — Google Tasks ignores
// time-of-day on `due`), open/done status, and category (via which list
// a task lives in). Priority has no Google-side equivalent. Conflict
// rule: last-write-wins by timestamp, same as page edits (design manual
// §7) — a personal, single-user task list makes a genuine concurrent
// edit on both sides at once vanishingly unlikely.
//
// PULL RUNS BEFORE PUSH, deliberately — mirrors the exact fix already
// applied to the local<->Postgres sync engine, for the identical failure
// mode: if push ran first using Postgres's not-yet-caught-up state, it
// would blindly overwrite a fresher change made directly in the Google
// Tasks app (e.g. completing a task on the phone) with the stale local
// status, undoing it. Pulling first reconciles Postgres to whatever is
// actually newer BEFORE push reads it, so push then only ever sends a
// no-op (already-matching) write in that case instead of an overwrite.
// (Real incident, 2026-09-07: marking a task done on the phone, or in the
// desktop widget, was observed reverting back to open shortly after.)
//
// Deleting a category folder does NOT delete its Google list — an
// orphaned list is harmless and reversible; auto-deleting someone's
// Google Tasks list on a local folder delete is not a trade worth
// making. Known limitation: only the first 100 tasks per list are read
// per sync (no pagination) — fine at personal scale.
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
  node_id: string | null;
  google_task_id: string | null;
  google_tasklist_id: string | null;
  updated_at: string;
}

interface CategoryNode {
  id: string;
  title: string;
  google_tasklist_id: string | null;
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

    async function createGoogleList(title: string): Promise<string> {
      const res = await fetch(`${TASKS_API}/users/@me/lists`, {
        method: "POST",
        headers: gHeaders,
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`Failed to create list "${title}": ${await res.text()}`);
      const list = await res.json();
      return list.id as string;
    }

    // 1. The default (uncategorized) list.
    const { data: settings } = await supabase
      .from("user_settings")
      .select("gtasks_list_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let defaultListId = settings?.gtasks_list_id as string | undefined;
    if (!defaultListId) {
      defaultListId = await createGoogleList("Academic OS");
      await supabase.from("user_settings").upsert({ user_id: user.id, gtasks_list_id: defaultListId });
    }

    // 2. Load tasks and the category folders any of them reference.
    const { data: localTasksData, error: localErr } = await supabase
      .from("tasks")
      .select("id, title, notes, due_at, status, deleted_at, node_id, google_task_id, google_tasklist_id, updated_at");
    if (localErr) throw localErr;
    const localTasks = (localTasksData ?? []) as LocalTask[];

    const categoryIds = [...new Set(localTasks.map((t) => t.node_id).filter((id): id is string => !!id))];
    const categories = new Map<string, CategoryNode>();
    if (categoryIds.length > 0) {
      const { data: nodeRows } = await supabase
        .from("nodes")
        .select("id, title, google_tasklist_id")
        .in("id", categoryIds);
      for (const n of (nodeRows ?? []) as CategoryNode[]) categories.set(n.id, n);
    }

    // Keep each category's Google list title in step with the folder's
    // current name — cheap and idempotent to just always PATCH it.
    async function listIdForCategory(nodeId: string): Promise<string> {
      const node = categories.get(nodeId);
      if (!node) return defaultListId!;
      if (!node.google_tasklist_id) {
        const listId = await createGoogleList(`Academic OS — ${node.title}`);
        node.google_tasklist_id = listId;
        await supabase.from("nodes").update({ google_tasklist_id: listId }).eq("id", nodeId);
      } else {
        await fetch(`${TASKS_API}/users/@me/lists/${node.google_tasklist_id}`, {
          method: "PATCH",
          headers: gHeaders,
          body: JSON.stringify({ title: `Academic OS — ${node.title}` }),
        }).catch(() => {});
      }
      return node.google_tasklist_id;
    }

    async function targetListFor(task: LocalTask): Promise<string> {
      return task.node_id ? await listIdForCategory(task.node_id) : defaultListId!;
    }

    // 3. Pull: Google -> local, one list at a time (default + every
    // category list we know about). Runs BEFORE push — see the file-level
    // comment for why this order matters.
    const listsToPull = new Map<string, string | null>([[defaultListId!, null]]);
    for (const node of categories.values()) {
      if (node.google_tasklist_id) listsToPull.set(node.google_tasklist_id, node.id);
    }

    const localByGoogleId = new Map(localTasks.filter((t) => t.google_task_id).map((t) => [t.google_task_id as string, t]));
    const seenGoogleIds = new Set<string>();
    // Only lists we actually fetched successfully are trustworthy for the
    // deletion reconciliation in step 5. A transient fetch failure must
    // NOT be read as "every task in this list was deleted on Google".
    const pulledListIds = new Set<string>();

    for (const [listId, nodeIdForList] of listsToPull) {
      const listRes = await fetch(`${TASKS_API}/lists/${listId}/tasks?showCompleted=true&showHidden=true&maxResults=100`, {
        headers: gHeaders,
      });
      if (!listRes.ok) continue; // a stale/deleted list on Google's side shouldn't fail the whole sync
      pulledListIds.add(listId);
      const { items } = (await listRes.json()) as { items?: GTask[] };
      const googleTasks = (items ?? []).filter((g) => !g.deleted && !g.hidden);

      for (const gtask of googleTasks) {
        seenGoogleIds.add(gtask.id);
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
            node_id: nodeIdForList,
            project_id: null,
            google_task_id: gtask.id,
            google_tasklist_id: listId,
          });
          continue;
        }

        if (existing.deleted_at) continue; // about to be deleted on Google's side too, below

        // Only apply Google's version if it's actually newer than what we
        // have locally — otherwise this is just Google echoing back a
        // write we're about to make (or already made) ourselves.
        const googleUpdated = gtask.updated ? new Date(gtask.updated).getTime() : 0;
        const localUpdated = new Date(existing.updated_at).getTime();
        if (googleUpdated > localUpdated + 5000) {
          const newUpdatedAt = new Date().toISOString();
          await supabase
            .from("tasks")
            .update({ title: gtask.title || existing.title, notes: gtask.notes ?? null, due_at: dueAt, status })
            .eq("id", existing.id);
          // Mutate in place, not just in Postgres — the push loop below
          // reads this same `localTasks` array. Without this, push would
          // still see the stale pre-pull status and immediately shove it
          // back onto Google, undoing the very update just applied (this
          // was the actual bug: a phone-side completion getting reverted
          // by the next sync round because push never saw it).
          existing.title = gtask.title || existing.title;
          existing.notes = gtask.notes ?? null;
          existing.due_at = dueAt;
          existing.status = status;
          existing.updated_at = newUpdatedAt;
        }
      }
    }

    // 4. Push: local -> Google. Now operating on `localTasks` as
    // reconciled by the pull step above, so a task Google already has the
    // newer version of gets pushed back as a no-op rather than an overwrite.
    for (const task of localTasks) {
      if (task.deleted_at) {
        if (task.google_task_id && task.google_tasklist_id) {
          await fetch(`${TASKS_API}/lists/${task.google_tasklist_id}/tasks/${task.google_task_id}`, {
            method: "DELETE",
            headers: gHeaders,
          }).catch(() => {}); // already gone on Google's side is fine
        }
        continue;
      }

      const targetList = await targetListFor(task);
      // Explicit `null`, not `undefined` — Google's PATCH is a partial
      // update where an OMITTED field means "leave unchanged", not "clear
      // it" (JSON.stringify drops `undefined` keys entirely). Clearing a
      // task's notes or due date locally was silently not propagating to
      // Google for exactly this reason; `null` is what actually clears it.
      const body = {
        title: task.title,
        notes: task.notes ?? null,
        status: task.status === "done" ? "completed" : "needsAction",
        due: task.due_at ? new Date(task.due_at).toISOString() : null,
      };

      // Tasks synced before this migration have google_task_id set but
      // google_tasklist_id still NULL (the column didn't exist yet) —
      // treat those as having been in the default list, the only one
      // that existed at the time, rather than as "list unknown" (which
      // would read as "moved" below and create a duplicate for every
      // task that had already synced once).
      const effectiveOldList = task.google_tasklist_id ?? (task.google_task_id ? defaultListId : null);

      if (!task.google_task_id) {
        const insertRes = await fetch(`${TASKS_API}/lists/${targetList}/tasks`, {
          method: "POST",
          headers: gHeaders,
          body: JSON.stringify(body),
        });
        if (insertRes.ok) {
          const created = (await insertRes.json()) as GTask;
          task.google_task_id = created.id;
          task.google_tasklist_id = targetList;
          await supabase
            .from("tasks")
            .update({ google_task_id: created.id, google_tasklist_id: targetList })
            .eq("id", task.id);
        }
      } else if (effectiveOldList === targetList) {
        await fetch(`${TASKS_API}/lists/${targetList}/tasks/${task.google_task_id}`, {
          method: "PATCH",
          headers: gHeaders,
          body: JSON.stringify(body),
        });
      } else {
        // Category changed since the last sync — Tasks API has no
        // cross-list move, so delete the old copy and recreate it.
        if (effectiveOldList) {
          await fetch(`${TASKS_API}/lists/${effectiveOldList}/tasks/${task.google_task_id}`, {
            method: "DELETE",
            headers: gHeaders,
          }).catch(() => {});
        }
        const insertRes = await fetch(`${TASKS_API}/lists/${targetList}/tasks`, {
          method: "POST",
          headers: gHeaders,
          body: JSON.stringify(body),
        });
        if (insertRes.ok) {
          const created = (await insertRes.json()) as GTask;
          task.google_task_id = created.id;
          task.google_tasklist_id = targetList;
          await supabase
            .from("tasks")
            .update({ google_task_id: created.id, google_tasklist_id: targetList })
            .eq("id", task.id);
        }
      }
    }

    // 5. A local task previously mapped to a Google task that no longer
    // exists in the list we actually fetched (deleted from the Google
    // Tasks app) gets soft-deleted here too — this is what makes it a
    // real two-way sync rather than push-only. Gated on
    // pulledListIds.has(...) so a transient failure to fetch a list is
    // never mistaken for "everything in it was deleted" — those tasks
    // are simply left alone until a sync that reads their list cleanly.
    for (const task of localTasks) {
      if (
        task.google_task_id &&
        !task.deleted_at &&
        task.google_tasklist_id &&
        pulledListIds.has(task.google_tasklist_id) &&
        !seenGoogleIds.has(task.google_task_id)
      ) {
        await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", task.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, pushed: localTasks.length, lists: listsToPull.size }), {
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
