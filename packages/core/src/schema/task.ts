import { z } from "zod";
import { syncableBase } from "./base";

export const taskStatus = z.enum(["open", "done", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatus>;

export const taskSchema = syncableBase.extend({
  title: z.string().min(1),
  notes: z.string().nullable(),
  due_at: z.string().datetime().nullable(),
  status: taskStatus.default("open"),
  priority: z.number().int().default(0),
  completed_at: z.string().datetime().nullable(),
  sort_order: z.number(),
  node_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
});

export type Task = z.infer<typeof taskSchema>;
