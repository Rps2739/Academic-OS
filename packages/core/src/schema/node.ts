import { z } from "zod";
import { syncableBase } from "./base";

export const nodeKind = z.enum(["folder", "page"]);
export type NodeKind = z.infer<typeof nodeKind>;

export const nodeSchema = syncableBase.extend({
  parent_id: z.string().uuid().nullable(),
  kind: nodeKind,
  title: z.string().min(1).default("Untitled"),
  icon: z.string().nullable(),
  sort_order: z.number(),
});

export type Node = z.infer<typeof nodeSchema>;
