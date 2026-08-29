import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errors";

export const AI_API_KEY_COOKIE_NAME = "lilpolaris-ai-api-key";

const COOKIE_VERSION = "v1";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const KDF_SALT = Buffer.from("lilpolaris-blog-admin", "utf8");
const KDF_INFO = Buffer.from("ai-api-key-cookie:v1", "utf8");
const ADDITIONAL_AUTHENTICATED_DATA = Buffer.from(
  `${AI_API_KEY_COOKIE_NAME}:${COOKIE_VERSION}`,
  "utf8",
);

export type AiApiKeySource = "encrypted-cookie" | "environment" | "none";

export interface AiApiKeyStorageStatus {
  configured: boolean;
  source: AiApiKeySource;
  scope: "current-browser" | "server-environment" | "none";
}

type AuthMode = "oauth" | "local-cli";

function requireAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new AppError(
      "CONFIG_MISSING",
      "尚未配置 AUTH_SECRET，无法安全保存 AI API Key。",
      503,
      { missing: ["AUTH_SECRET"] },
    );
  }
  return secret;
}

function deriveEncryptionKey(authSecret: string) {
  if (!authSecret) {
    throw new Error("AUTH_SECRET is required to encrypt the AI API Key.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(authSecret, "utf8"),
      KDF_SALT,
      KDF_INFO,
      KEY_BYTES,
    ),
  );
}

/**
 * Encrypts a key for server-side persistence. Callers own API-key validation,
 * including any minimum or maximum length policy.
 */
export function encryptAiApiKey(apiKey: string, authSecret: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(authSecret),
    iv,
    { authTagLength: AUTH_TAG_BYTES },
  );
  cipher.setAAD(ADDITIONAL_AUTHENTICATED_DATA);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    COOKIE_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

/** Returns undefined when the cookie is malformed, stale, or has been altered. */
export function decryptAiApiKey(value: string, authSecret: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== COOKIE_VERSION) return undefined;

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    const authTag = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      return undefined;
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveEncryptionKey(authSecret),
      iv,
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAAD(ADDITIONAL_AUTHENTICATED_DATA);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

export function shouldUseSecureAiApiKeyCookie(
  authMode: AuthMode,
  nodeEnvironment = process.env.NODE_ENV,
) {
  return nodeEnvironment === "production" && authMode !== "local-cli";
}

function currentAuthMode(): AuthMode {
  return process.env.AUTH_MODE === "local-cli" ? "local-cli" : "oauth";
}

function storageStatus(
  cookieConfigured: boolean,
  environmentConfigured: boolean,
): AiApiKeyStorageStatus {
  if (cookieConfigured) {
    return {
      configured: true,
      source: "encrypted-cookie",
      scope: "current-browser",
    };
  }
  if (environmentConfigured) {
    return {
      configured: true,
      source: "environment",
      scope: "server-environment",
    };
  }
  return { configured: false, source: "none", scope: "none" };
}

/** Server-only getter used immediately before calling the configured AI API. */
export async function getStoredAiApiKey(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const value = cookieStore.get(AI_API_KEY_COOKIE_NAME)?.value;
  if (!value) return undefined;
  return decryptAiApiKey(value, requireAuthSecret());
}

/**
 * Reports only whether a key exists and where it comes from. The caller may
 * pass a boolean for an environment fallback; this module never reads
 * AI_API_KEY itself.
 */
export async function getAiApiKeyStorageStatus(
  environmentConfigured = false,
): Promise<AiApiKeyStorageStatus> {
  const storedKey = await getStoredAiApiKey();
  return storageStatus(storedKey !== undefined, environmentConfigured);
}

export async function saveStoredAiApiKey(
  apiKey: string,
): Promise<AiApiKeyStorageStatus> {
  const value = encryptAiApiKey(apiKey, requireAuthSecret());
  const cookieStore = await cookies();
  cookieStore.set(AI_API_KEY_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureAiApiKeyCookie(currentAuthMode()),
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return storageStatus(true, false);
}

export async function clearStoredAiApiKey(
  environmentConfigured = false,
): Promise<AiApiKeyStorageStatus> {
  const cookieStore = await cookies();
  cookieStore.delete(AI_API_KEY_COOKIE_NAME);
  return storageStatus(false, environmentConfigured);
}
