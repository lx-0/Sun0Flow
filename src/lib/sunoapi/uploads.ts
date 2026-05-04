import type { FileUploadResult, StreamUploadResult } from "./types";
import { SunoApiError } from "./errors";
import { FILE_UPLOAD_BASE_URL } from "./constants";
import { fetchWithRetry, buildHeaders } from "./fetch";
import { SUNOAPI_KEY } from "@/lib/env";

/**
 * Upload a file via base64 encoding. Best for files ≤10MB.
 * Files are automatically deleted after 3 days. Uploads are free.
 */
export async function uploadFileBase64(
  base64Data: string,
  apiKey?: string
): Promise<FileUploadResult> {
  const res = await fetchWithRetry(`${FILE_UPLOAD_BASE_URL}/api/file-base64-upload`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ file: base64Data }),
  });

  const json = (await res.json()) as { success?: boolean; code?: number; data?: FileUploadResult };
  if (!json.data?.fileUrl) {
    throw new SunoApiError(500, "No file data returned from base64 upload");
  }
  return json.data;
}

/**
 * Upload a file via URL. The server downloads from the provided URL.
 * Best for remote files. 30-second download timeout, ≤100MB recommended.
 */
export async function uploadFileFromUrl(
  url: string,
  apiKey?: string
): Promise<FileUploadResult> {
  const res = await fetchWithRetry(`${FILE_UPLOAD_BASE_URL}/api/file-url-upload`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ url }),
  });

  const json = (await res.json()) as { success?: boolean; code?: number; data?: FileUploadResult };
  if (!json.data?.fileUrl) {
    throw new SunoApiError(500, "No file data returned from URL upload");
  }
  return json.data;
}

/**
 * Upload a file via multipart stream. Best for files >10MB.
 * Files are automatically deleted after 3 days. Uploads are free.
 */
export async function uploadFileStream(
  file: Blob | Buffer,
  uploadPath: string,
  fileName?: string,
  apiKey?: string
): Promise<StreamUploadResult> {
  const key = apiKey || SUNOAPI_KEY;
  if (!key) {
    throw new SunoApiError(0, "SUNOAPI_KEY environment variable is not set");
  }

  const formData = new FormData();
  const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)]);
  formData.append("file", blob, fileName);
  formData.append("uploadPath", uploadPath);
  if (fileName) formData.append("fileName", fileName);

  const res = await fetchWithRetry(`${FILE_UPLOAD_BASE_URL}/api/file-stream-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: formData,
  });

  const json = (await res.json()) as { success?: boolean; code?: number; data?: StreamUploadResult };
  if (!json.data?.downloadUrl) {
    throw new SunoApiError(500, "No file data returned from stream upload");
  }
  return json.data;
}
