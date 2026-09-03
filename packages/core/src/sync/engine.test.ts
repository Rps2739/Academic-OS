import { beforeEach, describe, expect, it } from "vitest";
import { sync } from "./engine";
import { createFakeClock } from "./fake-clock";
import { InMemoryLocalDb } from "./memory-local-db";
import { InMemoryRemoteDb } from "./memory-remote-db";
import type { Clock } from "./types";

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
