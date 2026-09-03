import { z } from "zod";

/**
 * `blocks` (the BlockNote/ProseMirror document) is the single source of
 * truth. `markdown` and `plaintext` are a client-computed cache derived at
 * save time — BlockNote's markdown conversion runs on a live editor
 * instance, so it CANNOT be derived server-side. The desktop app computes
 * all three fields and sends them together on every save.
 *
 * Primary key is `node_id`, not `id` — a page_body is a 1:1 extension of its
 * node. The sync engine's DB adapters map `node_id` to the generic `id`
 * field the engine expects; this schema stays faithful to the real table.
 */
export const pageBodySchema = z.object({
  node_id: z.string().uuid(),
  user_id: z.string().uuid(),
  blocks: z.unknown(), // BlockNote Block[] — validated by the editor, not here
  markdown: z.string().default(""),
  plaintext: z.string().default(""),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type PageBody = z.infer<typeof pageBodySchema>;

export const pageVersionSchema = z.object({
  id: z.string().uuid(),
  node_id: z.string().uuid(),
  user_id: z.string().uuid(),
  blocks: z.unknown(),
  markdown: z.string().nullable(),
  device_id: z.string(),
  created_at: z.string().datetime(),
});

export type PageVersion = z.infer<typeof pageVersionSchema>;
