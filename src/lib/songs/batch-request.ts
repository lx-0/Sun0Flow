import { z } from "zod";

export const batchActionSchema = z.enum([
  "favorite",
  "unfavorite",
  "delete",
  "restore",
  "permanent_delete",
  "tag",
  "add_to_playlist",
  "make_public",
  "make_private",
]);

export const executeBatchRequestSchema = z.object({
  action: batchActionSchema,
  songIds: z.array(z.string()).min(1, "songIds must be a non-empty array").max(50, "Maximum 50 songs per batch operation"),
  tagId: z.string().optional(),
  playlistId: z.string().optional(),
});

export type ExecuteBatchRequest = z.infer<typeof executeBatchRequestSchema>;
