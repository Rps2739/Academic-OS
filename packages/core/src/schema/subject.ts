import { z } from "zod";
import { syncableBase } from "./base";

export const subjectSchema = syncableBase.extend({
  name: z.string().min(1),
  code: z.string().nullable(),
  term: z.string().nullable(),
  node_id: z.string().uuid().nullable(),
  // Alternate spellings the timetable has used for this subject
  // ("Mktg Mgmt", "Marketing Management", "MM-101"...). The normaliser
  // matches against these and appends new spellings it resolves.
  aliases: z.array(z.string()).default([]),
});

export type Subject = z.infer<typeof subjectSchema>;
