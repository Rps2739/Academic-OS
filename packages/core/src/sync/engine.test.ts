import { beforeEach, describe, expect, it, vi } from "vitest";
import { sync } from "./engine";
import { createFakeClock } from "./fake-clock";
import { InMemoryLocalDb } from "./memory-local-db";
import { InMemoryRemoteDb } from "./memory-remote-db";
import type { TableName } from "./tables";
import type { Clock, RemoteDb, SyncRow } from "./types";

/**
 * Wraps a real RemoteDb but makes push() throw for one chosen table —
 * simulates a row that can never satisfy a server-side constraint
 * (e.g. a unique index violation), without needing the in-memory fake
 * itself to understand Postgres constraints.
 */
class ThrowsOnPushRemoteDb implements RemoteDb {
  constructor(
    private readonly inner: RemoteDb,
    private readonly failingTable: TableName
  ) {}

  push(table: TableName, rows: SyncRow[]): Promise<Array<{ id: string; updated_at: string }>> {
    if (table === this.failingTable) {
      return Promise.reject(new Error(`simulated constraint violation on ${table}`));
    }
    return this.inner.push(table, rows);
  }

  pull(table: TableName, since: string): Promise<SyncRow[]> {
    return this.inner.pull(table, since);
  }
}

/**
 * Simulates a table whose Postgres migration hasn't been applied yet —
 * exactly what happens when a new SYNC_TABLES entry is added to the app
 * before the user runs the corresponding migration in the Supabase
 * Dashboard (a real, expected sequencing gap this project's workflow
 * relies on — see CLAUDE.md's "user runs migrations" constraint).
 */
class ThrowsOnPullRemoteDb implements RemoteDb {
  constructor(
    private readonly inner: RemoteDb,
    private readonly failingTable: TableName
  ) {}

  push(table: TableName, rows: SyncRow[]): Promise<Array<{ id: string; updated_at: string }>> {
    return this.inner.push(table, rows);
  }

  pull(table: TableName, since: string): Promise<SyncRow[]> {
    if (table === this.failingTable) {
      return Promise.reject(new Error(`relation "public.${table}" does not exist`));
    }
    return this.inner.pull(table, since);
  }
}

const USER = "11111111-1111-1111-1111-111111111111";

function freshWorld() {
  // One shared clock: in synchronous test code, call order == chronological
  // order, so timestamp comparisons in assertions are fully deterministic.
  const clock: Clock = createFakeClock();
  const remote = new InMemoryRemoteDb(clock);
  const deviceA = new InMemoryLocalDb(clock);
  const deviceB = new InMemoryLocalDb(clock);
  return { clock, remote, deviceA, deviceB };
}

describe("sync engine — Phase 0 gate (design manual §7, §8 task 0.6)", () => {
  it("converges two devices that made offline edits to different rows", async () => {
    const { remote, deviceA, deviceB } = freshWorld();

    // Device A creates a task while offline.
    await deviceA.put("tasks", {
      id: "task-a",
      user_id: USER,
      title: "Finish case comp deck",
      status: "open",
    });

    // Device B, independently offline, creates a different task.
    await deviceB.put("tasks", {
      id: "task-b",
      user_id: USER,
      title: "Read marketing case",
      status: "open",
    });

    // Both reconnect.
    await sync(deviceA, remote, "device-A");
    await sync(deviceB, remote, "device-B");
    // A second round lets each device pick up what the other just pushed.
    await sync(deviceA, remote, "device-A");
    await sync(deviceB, remote, "device-B");

    const aSeesB = await deviceA.getLocal("tasks", "task-b");
    const bSeesA = await deviceB.getLocal("tasks", "task-a");

    expect(aSeesB?.["title"]).toBe("Read marketing case");
    expect(bSeesA?.["title"]).toBe("Finish case comp deck");
    expect(aSeesB?.dirty).toBe(false);
    expect(bSeesA?.dirty).toBe(false);
  });

  it("resolves a conflicting page edit: newer server write wins, the local loser is archived to page_versions, never destroyed", async () => {
    const { remote, deviceA, deviceB } = freshWorld();

    const original = {
      id: "page-1",
      user_id: USER,
      blocks: "original",
      markdown: "original",
    };
    await deviceA.put("page_bodies", original);
    await sync(deviceA, remote, "device-A"); // seed server + clear A's dirty flag
    await sync(deviceB, remote, "device-B"); // B picks up the seeded page

    // Both devices edit the SAME page while offline. B edits first, then A —
    // both edits happen before either device syncs again.
    await deviceB.put("page_bodies", { id: "page-1", user_id: USER, blocks: "B version", markdown: "B version" });
    await deviceA.put("page_bodies", { id: "page-1", user_id: USER, blocks: "A version", markdown: "A version" });

    // B syncs first: its edit reaches the server.
    await sync(deviceB, remote, "device-B");

    // A syncs second: A is still dirty with an edit that is now stale
    // relative to what the server holds (B's write landed after A's local
    // edit was made). This must trigger the conflict branch.
    await sync(deviceA, remote, "device-A");

    const aRow = await deviceA.getLocal("page_bodies", "page-1");
    expect(aRow?.["blocks"]).toBe("B version");
    expect(aRow?.dirty).toBe(false);

    const versions = await deviceA.listPageVersions("page-1");
    expect(versions).toHaveLength(1);
    expect(versions[0]?.blocks).toBe("A version");
    expect(versions[0]?.device_id).toBe("device-A");

    // The system converges: B, syncing again, ends up on the same state.
    await sync(deviceB, remote, "device-B");
    const bRow = await deviceB.getLocal("page_bodies", "page-1");
    expect(bRow?.["blocks"]).toBe("B version");
  });

  it("propagates a soft delete as an ordinary field change", async () => {
    const { remote, deviceA, deviceB } = freshWorld();

    await deviceA.put("tasks", { id: "task-x", user_id: USER, title: "Temporary", status: "open" });
    await sync(deviceA, remote, "device-A");
    await sync(deviceB, remote, "device-B");

    expect((await deviceB.getLocal("tasks", "task-x"))?.deleted_at).toBeNull();

    const now = new Date().toISOString();
    await deviceA.put("tasks", { id: "task-x", user_id: USER, deleted_at: now });
    await sync(deviceA, remote, "device-A");
    await sync(deviceB, remote, "device-B");

    const onB = await deviceB.getLocal("tasks", "task-x");
    expect(onB?.deleted_at).not.toBeNull();
  });

  it("is idempotent: re-syncing with nothing new changes nothing and creates no phantom conflicts", async () => {
    const { remote, deviceA } = freshWorld();

    await deviceA.put("subjects", { id: "subj-1", user_id: USER, name: "Marketing Management", aliases: [] });
    await sync(deviceA, remote, "device-A");

    const before = await deviceA.getLocal("subjects", "subj-1");
    await sync(deviceA, remote, "device-A");
    const after = await deviceA.getLocal("subjects", "subj-1");

    expect(after).toEqual(before);
  });

  it("a table's push failing doesn't block tables listed after it in SYNC_TABLES", async () => {
    const { remote, deviceA } = freshWorld();
    // Mirrors the 2026-09-04 incident exactly: timetable_imports comes
    // right before class_sessions in SYNC_TABLES, and a row that can
    // never satisfy a server-side constraint (there, a duplicate
    // checksum) must not stop class_sessions from syncing too.
    const flakyRemote = new ThrowsOnPushRemoteDb(remote, "timetable_imports");

    await deviceA.put("timetable_imports", {
      id: "import-1",
      user_id: USER,
      source: "manual_upload",
      week_start: "2026-01-05",
      raw: [],
      checksum: "duplicate-checksum",
      parsed_ok: true,
    });
    await deviceA.put("class_sessions", {
      id: "session-1",
      user_id: USER,
      import_id: "import-1",
      week_start: "2026-01-05",
      starts_at: "2026-01-05T09:00:00.000Z",
      ends_at: "2026-01-05T10:00:00.000Z",
      subject_label: "Test Subject",
      status: "scheduled",
    });

    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    await sync(deviceA, flakyRemote, "device-A");
    consoleErr.mockRestore();

    // The poisoned row stays dirty, ready to retry next round — never
    // silently dropped or marked clean despite never reaching the server.
    expect((await deviceA.getLocal("timetable_imports", "import-1"))?.dirty).toBe(true);

    // The table listed AFTER it in SYNC_TABLES must still have synced.
    // Before the fix, this stayed dirty forever too, purely because of
    // table ordering — nothing to do with class_sessions itself.
    expect((await deviceA.getLocal("class_sessions", "session-1"))?.dirty).toBe(false);
    const onServer = await remote.pull("class_sessions", "1970-01-01T00:00:00.000Z");
    expect(onServer.find((r) => r.id === "session-1")).toBeDefined();
  });

  it("a table's pull failing doesn't block tables listed after it, and the sync cursor still advances", async () => {
    const { remote, deviceA, deviceB } = freshWorld();

    // Device B creates rows in two tables and syncs them up first, so
    // there's something for device A to pull down.
    await deviceB.put("timetable_imports", {
      id: "import-1",
      user_id: USER,
      source: "manual_upload",
      week_start: "2026-01-05",
      raw: [],
      checksum: "some-checksum",
      parsed_ok: true,
    });
    await deviceB.put("class_sessions", {
      id: "session-1",
      user_id: USER,
      import_id: "import-1",
      week_start: "2026-01-05",
      starts_at: "2026-01-05T09:00:00.000Z",
      ends_at: "2026-01-05T10:00:00.000Z",
      subject_label: "Test Subject",
      status: "scheduled",
    });
    await sync(deviceB, remote, "device-B");

    // Device A syncs against a remote whose timetable_imports table isn't
    // reachable (its Postgres migration hasn't been applied) —
    // timetable_imports comes right before class_sessions in SYNC_TABLES.
    const flakyRemote = new ThrowsOnPullRemoteDb(remote, "timetable_imports");
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    await sync(deviceA, flakyRemote, "device-A");
    consoleErr.mockRestore();

    // class_sessions, listed AFTER the failing table, must still have
    // pulled — nothing to do with timetable_imports' own failure.
    expect((await deviceA.getLocal("class_sessions", "session-1"))?.["subject_label"]).toBe("Test Subject");

    // A second sync round (now against the real, working remote) must
    // still converge timetable_imports — proving the cursor wasn't
    // silently advanced past it while it was failing.
    await sync(deviceA, remote, "device-A");
    expect((await deviceA.getLocal("timetable_imports", "import-1"))?.["checksum"]).toBe("some-checksum");
  });
});

describe("in-memory fakes", () => {
  let remote: InMemoryRemoteDb;

  beforeEach(() => {
    remote = new InMemoryRemoteDb(createFakeClock());
  });

  it("RemoteDb.push always assigns its own updated_at, ignoring whatever the client sent", async () => {
    const [result] = await remote.push("tasks", [
      {
        id: "t1",
        user_id: USER,
        title: "x",
        status: "open",
        created_at: "2099-01-01T00:00:00.000Z",
        updated_at: "2099-01-01T00:00:00.000Z", // a lying client
        deleted_at: null,
      },
    ]);
    expect(result?.updated_at).not.toBe("2099-01-01T00:00:00.000Z");
  });
});
