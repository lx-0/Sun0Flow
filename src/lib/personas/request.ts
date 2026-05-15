import { z } from "zod";

export const createPersonaRequestSchema = z.object({
  taskId: z.string().trim().min(1, "taskId is required"),
  name: z.string().trim().min(1, "name is required").max(100, "Name must be 100 characters or less"),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
  vocalStart: z.number().optional(),
  vocalEnd: z.number().optional(),
  style: z.string().optional(),
  songId: z.string().optional(),
});

export type CreatePersonaRequest = z.infer<typeof createPersonaRequestSchema>;
