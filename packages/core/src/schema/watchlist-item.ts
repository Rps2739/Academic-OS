import { z } from "zod";
import { syncableBase } from "./base";

export const watchlistItemKind = z.enum(["stock", "mf"]);
export type WatchlistItemKind = z.infer<typeof watchlistItemKind>;

export const watchlistItemSchema = syncableBase.extend({
  symbol: z.string().min(1),
  kind: watchlistItemKind,
  display_name: z.string().nullable(),
  scheme_code: z.string().nullable(),
  sort_order: z.number().default(0),
});

export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
