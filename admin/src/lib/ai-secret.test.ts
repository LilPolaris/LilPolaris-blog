import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieStore = {
  delete: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

import {
  AI_API_KEY_COOKIE_NAME,
  clearStoredAiApiKey,
  decryptAiApiKey,
  encryptAiApiKey,
  getAiApiKeyStorageStatus,
  getStoredAiApiKey,
  saveStoredAiApiKey,
  shouldUseSecureAiApiKeyCookie,
} from "@/lib/ai-secret";

const AUTH_SECRET = "a-long-random-auth-secret-used-only-for-tests";
const API_KEY = "test-api-key-not-a-real-secret";

describe("AI API Key encryption", () => {
  it("round-trips through AES-256-GCM without embedding plaintext", () => {
    const encrypted = encryptAiApiKey(API_KEY, AUTH_SECRET);

    expect(encrypted).toMatch(/^v1\.[^.]+\.[^.]+\.[^.]+$/);
    expect(encrypted).not.toContain(API_KEY);
    expect(decryptAiApiKey(encrypted, AUTH_SECRET)).toBe(API_KEY);
  });

  it("uses a fresh IV for each encryption", () => {
    const first = encryptAiApiKey(API_KEY, AUTH_SECRET);
    const second = encryptAiApiKey(API_KEY, AUTH_SECRET);

    expect(first).not.toBe(second);
    expect(decryptAiApiKey(first, AUTH_SECRET)).toBe(API_KEY);
    expect(decryptAiApiKey(second, AUTH_SECRET)).toBe(API_KEY);
  });

  it("rejects the wrong AUTH_SECRET and tampered ciphertext", () => {
    const encrypted = encryptAiApiKey(API_KEY, AUTH_SECRET);
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[2], "base64url");
    ciphertext[0] ^= 1;
    parts[2] = ciphertext.toString("base64url");

    expect(decryptAiApiKey(encrypted, "a-different-auth-secret")).toBeUndefined();
    expect(decryptAiApiKey(parts.join("."), AUTH_SECRET)).toBeUndefined();
  });

  it("rejects malformed and unsupported cookie values", () => {
    expect(decryptAiApiKey("", AUTH_SECRET)).toBeUndefined();
    expect(decryptAiApiKey("v2.a.b.c", AUTH_SECRET)).toBeUndefined();
    expect(decryptAiApiKey("v1.invalid.invalid.invalid", AUTH_SECRET)).toBeUndefined();
  });
});

describe("AI API Key cookie storage", () => {
  beforeEach(() => {
    cookieStore.delete.mockReset();
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
    cookieStore.get.mockReturnValue(undefined);
    vi.stubEnv("AUTH_SECRET", AUTH_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps local-cli cookies usable over production localhost HTTP", async () => {
    vi.stubEnv("AUTH_MODE", "local-cli");
    vi.stubEnv("NODE_ENV", "production");

    const status = await saveStoredAiApiKey(API_KEY);

    expect(cookieStore.set).toHaveBeenCalledWith(
      AI_API_KEY_COOKIE_NAME,
      expect.not.stringContaining(API_KEY),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        secure: false,
      }),
    );
    expect(status).toEqual({
      configured: true,
      source: "encrypted-cookie",
      scope: "current-browser",
    });
    expect(status).not.toHaveProperty("apiKey");
  });

  it("sets Secure for OAuth in production", async () => {
    vi.stubEnv("AUTH_MODE", "oauth");
    vi.stubEnv("NODE_ENV", "production");

    await saveStoredAiApiKey(API_KEY);

    expect(cookieStore.set).toHaveBeenCalledWith(
      AI_API_KEY_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
  });

  it("decrypts the cookie only through the server-only getter", async () => {
    cookieStore.get.mockReturnValue({
      value: encryptAiApiKey(API_KEY, AUTH_SECRET),
    });

    await expect(getStoredAiApiKey()).resolves.toBe(API_KEY);
    await expect(getAiApiKeyStorageStatus()).resolves.toEqual({
      configured: true,
      source: "encrypted-cookie",
      scope: "current-browser",
    });
  });

  it("clears the cookie and can report an environment fallback", async () => {
    const status = await clearStoredAiApiKey(true);

    expect(cookieStore.delete).toHaveBeenCalledWith(AI_API_KEY_COOKIE_NAME);
    expect(status).toEqual({
      configured: true,
      source: "environment",
      scope: "server-environment",
    });
  });
});

describe("shouldUseSecureAiApiKeyCookie", () => {
  it("only requires HTTPS for production OAuth", () => {
    expect(shouldUseSecureAiApiKeyCookie("oauth", "production")).toBe(true);
    expect(shouldUseSecureAiApiKeyCookie("local-cli", "production")).toBe(false);
    expect(shouldUseSecureAiApiKeyCookie("oauth", "development")).toBe(false);
  });
});
