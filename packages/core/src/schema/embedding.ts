import { z } from "zod";

/**
 * Server-generated and server-only — never part of the client sync engine
 * (see sync/tables.ts). Defined here so Edge Functions in Phase 5 share one
 * validated shape for reads/writes.
 */
export const embeddingSourceType = z.enum(["page", "attachment"]);
export type EmbeddingSourceType = z.infer<typeof embeddingSourceType>;

export const embeddingSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  source_type: embeddingSourceType,
  source_id: z.string().uuid(),
  chunk_index: z.number().int().nonnegative(),
  content: z.string(),
  embedding: z.array(z.number()).length(768),
  created_at: z.string().datetime(),
});

export type Embedding = z.infer<typeof embeddingSchema>;
