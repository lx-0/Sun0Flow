export type ApiKeySettings = {
  sunoApiKey: string | null;
  usePersonalApiKey: boolean;
};

export type ApiKeyResponse = {
  hasKey: boolean;
  maskedKey: string | null;
  usePersonalApiKey: boolean;
};

export function maskApiKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 4) + "…" + value.slice(-4);
}

export function toApiKeyResponse(settings: ApiKeySettings): ApiKeyResponse {
  return {
    hasKey: Boolean(settings.sunoApiKey),
    maskedKey: maskApiKey(settings.sunoApiKey),
    usePersonalApiKey: settings.usePersonalApiKey,
  };
}

export function buildApiKeyUpdateData(payload: {
  sunoApiKey?: string;
  usePersonalApiKey?: boolean;
}): { sunoApiKey?: string | null; usePersonalApiKey?: boolean } {
  const updateData: { sunoApiKey?: string | null; usePersonalApiKey?: boolean } = {};

  if (payload.sunoApiKey !== undefined) {
    updateData.sunoApiKey = payload.sunoApiKey.trim() || null;
  }

  if (payload.usePersonalApiKey !== undefined) {
    updateData.usePersonalApiKey = payload.usePersonalApiKey;
  }

  return updateData;
}
