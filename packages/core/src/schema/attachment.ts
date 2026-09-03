import { z } from "zod";
import { syncableBase } from "./base";

export const ocrStatus = z.enum(["pending", "processing", "done", "failed", "skipped"]);
export type OcrStatus = z.infer<typeof ocrStatus>;

export const attachmentSchema = syncableBase.extend({
  node_id: z.string().uuid(),
  drive_file_id: z.string().nullable(),
  filename: z.string().min(1),
  mime: z.string().nullable(),
  size_bytes: z.number().int().nonnegative().nullable(),
  extracted_text: z.string().nullable(),
  local_path: z.string().nullable(), // set while an upload is queued offline
  ocr_status: ocrStatus.default("skipped"),
  capture_group_id: z.string().uuid().nullable(),
  capture_index: z.number().int().nonnegative().nullable(),
});

export type Attachment = z.infer<typeof attachmentSchema>;
