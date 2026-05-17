import { z } from "zod";

export const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB

export const uploadBodySchema = z.object({
  mode: z.string(),
  base64Data: z.string().optional(),
  fileUrl: z.string().optional(),
  title: z.string().optional(),
  prompt: z.string().optional(),
  style: z.string().optional(),
  instrumental: z.any().optional(),
  continueAt: z.any().optional(),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;

export function validateUploadBody(body: UploadBody): { error: string; code?: string } | null {
  const { mode, base64Data, fileUrl } = body;

  if (mode !== "cover" && mode !== "extend") {
    return { error: 'Mode must be "cover" or "extend"', code: "VALIDATION_ERROR" };
  }

  if (!base64Data && !fileUrl) {
    return { error: "Either a base64-encoded file or a file URL is required", code: "VALIDATION_ERROR" };
  }

  if (base64Data && fileUrl) {
    return { error: "Provide either base64Data or fileUrl, not both", code: "VALIDATION_ERROR" };
  }

  if (base64Data) {
    const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
    if (sizeBytes > MAX_BASE64_SIZE) {
      return { error: "File too large for base64 upload (max 10MB). Use a URL-based upload for larger files." };
    }
  }

  return null;
}

export function buildUploadGenerationInput(body: UploadBody) {
  const { mode, title, prompt, style, instrumental } = body;

  return {
    title: title?.trim() || null,
    prompt: prompt?.trim() || `Upload ${mode}`,
    tags: style?.trim() || null,
    isInstrumental: Boolean(instrumental),
  };
}
