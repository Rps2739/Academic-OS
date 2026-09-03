import { z } from "zod";

/**
 * One row per user, keyed by user_id. Read directly via the API, not part
 * of the offline sync engine — settings are small and always need a live
 * connection to change anyway (they gate Edge Function behaviour).
 * `gemini_key_ref` and `ingest_secret_hash` are references/hashes only;
 * the actual secrets live in Supabase Vault and never reach a client.
 */
export const userSettingsSchema = z.object({
  user_id: z.string().uuid(),
  timezone: z.string().default("Asia/Kolkata"),
  drive_folder_id: z.string().nullable(),
  gcal_calendar_id: z.string().nullable(),
  ingest_secret_hash: z.string().nullable(),
  gemini_key_ref: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;
