import "server-only";
import { getStoredAiApiKey } from "@/lib/ai-secret";
import { getAiMetadataConfig } from "@/lib/config";

export type AiApiKeySource = "encrypted-cookie" | "environment" | "none";

export interface AiMetadataStatus {
  configured: boolean;
  provider: string;
  model: string;
  source: AiApiKeySource;
  browserKeyStored: boolean;
  browserKeySupported: boolean;
}

export function supportsBrowserStoredAiKey(config: {
  provider: string;
  baseUrl: string;
}) {
  if (config.provider !== "deepseek") return false;
  try {
    return new URL(config.baseUrl).origin === "https://api.deepseek.com";
  } catch {
    return false;
  }
}

export async function getEffectiveAiMetadataConfig() {
  const base = getAiMetadataConfig();
  const storedApiKey = supportsBrowserStoredAiKey(base)
    ? await getStoredAiApiKey()
    : undefined;
  return {
    ...base,
    apiKey: storedApiKey || base.apiKey,
  };
}

export async function getAiMetadataStatus(): Promise<AiMetadataStatus> {
  const base = getAiMetadataConfig();
  const storedApiKey = await getStoredAiApiKey();
  const browserKeySupported = supportsBrowserStoredAiKey(base);
  const activeStoredApiKey = browserKeySupported ? storedApiKey : undefined;
  const source: AiApiKeySource = activeStoredApiKey
    ? "encrypted-cookie"
    : base.apiKey
      ? "environment"
      : "none";
  return {
    configured: Boolean(activeStoredApiKey || base.apiKey),
    provider: base.provider,
    model: base.model,
    source,
    browserKeyStored: Boolean(storedApiKey),
    browserKeySupported,
  };
}
