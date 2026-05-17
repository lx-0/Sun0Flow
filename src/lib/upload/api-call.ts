import {
  uploadAndCover,
  uploadAndExtend,
  uploadFileBase64,
  uploadFileFromUrl,
} from "@/lib/sunoapi";
import type { UploadBody } from "@/lib/upload/request";

export async function runUploadGenerationApiCall(body: UploadBody, userApiKey?: string) {
  const { mode, base64Data, fileUrl, prompt, style, title, instrumental, continueAt } = body;

  let uploadResult;
  if (base64Data) {
    uploadResult = await uploadFileBase64(base64Data, userApiKey);
  } else if (fileUrl) {
    uploadResult = await uploadFileFromUrl(fileUrl, userApiKey);
  } else {
    throw new Error("unreachable: base64Data or fileUrl validated above");
  }

  const uploadUrl = uploadResult.fileUrl;

  if (mode === "cover") {
    return uploadAndCover(
      {
        uploadUrl,
        customMode: !!(prompt || style),
        instrumental: Boolean(instrumental),
        prompt: prompt?.trim() || undefined,
        style: style?.trim() || undefined,
        title: title?.trim() || undefined,
      },
      userApiKey,
    );
  }

  return uploadAndExtend(
    {
      uploadUrl,
      instrumental: instrumental != null ? Boolean(instrumental) : undefined,
      prompt: prompt?.trim() || undefined,
      style: style?.trim() || undefined,
      title: title?.trim() || undefined,
      continueAt: continueAt != null ? Number(continueAt) : undefined,
    },
    userApiKey,
  );
}
