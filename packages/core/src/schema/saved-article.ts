import { z } from "zod";
import { syncableBase } from "./base";

export const savedArticleSchema = syncableBase.extend({
  title: z.string().min(1),
  link: z.string().url(),
  source: z.string().nullable(),
  summary: z.string().nullable(),
  category: z.string().nullable(),
  published_at: z.string().datetime().nullable(),
  note: z.string().nullable(),
});

export type SavedArticle = z.infer<typeof savedArticleSchema>;
