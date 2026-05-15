import { z } from "zod";

export const updatePlaylistBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "At least one of name or description is required",
  });

export const addPlaylistSongBody = z
  .object({
    songId: z.string().min(1),
  })
  .strict();

export const reorderPlaylistSongsBody = z
  .object({
    songIds: z.array(z.string().min(1)),
  })
  .strict();

export const togglePublishBody = z
  .object({
    genre: z
      .preprocess(
        (value) => {
          if (typeof value !== "string") return value;
          return value.trim();
        },
        z.string().min(1),
      )
      .optional(),
  })
  .strict();
