import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { supportsBrowserStoredAiKey } from "@/lib/ai-config";

describe("browser AI key provider binding", () => {
  it("only allows the encrypted browser key for the official DeepSeek origin", () => {
    expect(
      supportsBrowserStoredAiKey({
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
      }),
    ).toBe(true);
    expect(
      supportsBrowserStoredAiKey({
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com/v1",
      }),
    ).toBe(true);
    expect(
      supportsBrowserStoredAiKey({
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
      }),
    ).toBe(false);
    expect(
      supportsBrowserStoredAiKey({
        provider: "deepseek",
        baseUrl: "https://deepseek-proxy.example.com",
      }),
    ).toBe(false);
  });
});
