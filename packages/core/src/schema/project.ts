import { z } from "zod";
import { syncableBase } from "./base";

export const projectStatus = z.enum(["active", "done", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatus>;

export const teamMemberSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullable(),
});

export const projectSchema = syncableBase.extend({
  name: z.string().min(1),
  kind: z.string().default("case_comp"),
  stage: z.string().nullable(),
  deadline: z.string().datetime().nullable(),
  team: z.array(teamMemberSchema).default([]),
  node_id: z.string().uuid().nullable(),
  subject_id: z.string().uuid().nullable(),
  status: projectStatus.default("active"),
});

export type Project = z.infer<typeof projectSchema>;
