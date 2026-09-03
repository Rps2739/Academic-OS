// Phase 0 gate (design manual §8, task 0.4): prove a second user cannot
// read another user's rows, against the REAL hosted Postgres — not a unit
// test. Uses two independent anonymous auth sessions (no email/password,
// no service_role key — only the public anon key, read from env).
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon key> node supabase/tests/rls-check.mjs
//
// Requires "Allow anonymous sign-ins" enabled in Supabase Auth settings.
// Cleans up its own rows on exit; the two throwaway anonymous auth users
// remain (harmless — Auth > Users, safe to ignore or delete later).

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY env vars first.");
  process.exit(1);
}

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

async function signInAnon(label) {
  const c = client();
  const { data, error } = await c.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      `${label}: anonymous sign-in failed — ${error?.message ?? "no user returned"}. ` +
        `Enable it in Supabase dashboard: Authentication > Sign In / Providers > Anonymous.`
    );
  }
  return { client: c, userId: data.user.id };
}

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`);
    failures++;
  }
}

const a = await signInAnon("device A");
const b = await signInAnon("device B");
console.log(`Signed in: A=${a.userId} B=${b.userId}`);

// Each user writes one row of their own into a table with an owner RLS policy.
const { data: aTask, error: aInsertErr } = await a.client
  .from("tasks")
  .insert({ user_id: a.userId, title: "A's private task" })
  .select()
  .single();
check("A can insert its own row", !aInsertErr && !!aTask);

const { data: bTask, error: bInsertErr } = await b.client
  .from("tasks")
  .insert({ user_id: b.userId, title: "B's private task" })
  .select()
  .single();
check("B can insert its own row", !bInsertErr && !!bTask);

// The actual RLS proof: each user reads the WHOLE table. RLS should filter
// it down to only their own row, server-side — no client-side trust involved.
const { data: aVisible } = await a.client.from("tasks").select("id, user_id");
check("A sees exactly 1 row (their own)", (aVisible ?? []).length === 1);
check(
  "A cannot see B's row",
  !(aVisible ?? []).some((r) => r.id === bTask?.id)
);

const { data: bVisible } = await b.client.from("tasks").select("id, user_id");
check("B sees exactly 1 row (their own)", (bVisible ?? []).length === 1);
check(
  "B cannot see A's row",
  !(bVisible ?? []).some((r) => r.id === aTask?.id)
);

// Direct fetch-by-id of the other user's row must also come back empty —
// not just filtered out of a list scan.
const { data: aReadingB } = await a.client.from("tasks").select().eq("id", bTask?.id ?? "");
check("A cannot fetch B's row by id", (aReadingB ?? []).length === 0);

// Cleanup — each user deletes only what RLS lets them delete: their own row.
if (aTask) await a.client.from("tasks").delete().eq("id", aTask.id);
if (bTask) await b.client.from("tasks").delete().eq("id", bTask.id);

console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
