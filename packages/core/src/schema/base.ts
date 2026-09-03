import { z } from "zod";

/**
 * Every user-owned table carries these five columns. `updated_at` is owned
 * exclusively by the server trigger (see supabase/migrations/0001_init.sql) —
 * clients must never set it themselves; the sync engine relies on that.
 */
export const syncableBase = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});

export type SyncableBase = z.infer<typeof syncableBase>;
