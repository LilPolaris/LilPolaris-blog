import { describe, expect, it, vi } from "vitest";
import {
  aiMetadataRequestSchema,
  buildMetadataPrompt,
  extractModelJson,
  generateAiMetadata,
  normalizeMetadataSuggestion,
  preferredSeriesSlug,
} from "@/lib/ai-metadata";
import type { AiMetadataConfig, PostSummary } from "@/lib/types";

const posts: PostSummary[] = [
  {
    id: "one",
    path: "source/_posts/zju-review.md",
    kind: "post",
    sha: "sha",
    title: "浙江大学课程回顾",
    slug: "zju-review",
    date: "2026-08-01 12:00:00",
    updated: "2026-08-01 12:00:00",
    tags: ["浙江大学", "课程评价"],
    categories: [["大学", "课程测评"]],
    excerpt: "不应发给模型的摘要",
    draft: false,
  },
];

const config: AiMetadataConfig = {
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "qwen3.5:9b",
  apiKey: "ollama",
  timeoutMs: 5_000,
};

function completion(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { headers: { "content-type": "application/json" } },
  );
}

describe("AI article metadata", () => {
  it("uses the requested fixed series style for freshman semesters", () => {
    expect(preferredSeriesSlug("Lil Polaris 大一上总结")).toBe(
      "freshman-year-1-sem-1",
    );
    expect(preferredSeriesSlug("浙大大一下学期课程总结")).toBe(
      "freshman-year-1-sem-2",
    );
    expect(preferredSeriesSlug("普通教程")).toBe("");
  });

  it("only includes historical front matter needed for classification", () => {
    const prompt = buildMetadataPrompt("新标题", [
      ...posts,
      {
        ...posts[0],
        id: "draft",
        path: "source/_drafts/private.md",
        kind: "draft",
        title: "尚未发布的私密草稿标题",
        slug: "private-draft",
        draft: true,
      },
    ]);
    expect(prompt).toContain("浙江大学课程回顾");
    expect(prompt).toContain("课程测评");
    expect(prompt).not.toContain("不应发给模型的摘要");
    expect(prompt).not.toContain("尚未发布的私密草稿标题");
  });

  it("includes bounded current content and existing editor taxonomy", () => {
    const prompt = buildMetadataPrompt("正文驱动分类", posts, {
      content: "正文讲的是新的研究方向。",
      excerpt: "研究摘要",
      currentTags: ["待确认"],
      currentCategories: [["研究", "草稿分类"]],
    });
    expect(prompt).toContain("正文讲的是新的研究方向");
    expect(prompt).toContain("研究摘要");
    expect(prompt).toContain("待确认");
    expect(prompt).toContain("草稿分类");
  });

  it("bounds unusually large historical metadata before model submission", () => {
    const oversizedValue = "x".repeat(10_000);
    const oversizedPosts = Array.from({ length: 100 }, (_, index) => ({
      ...posts[0],
      id: `post-${index}`,
      path: `source/_posts/post-${index}.md`,
      title: oversizedValue,
      slug: `post-${index}`,
      tags: [oversizedValue],
      categories: [[oversizedValue]],
    }));
    const prompt = buildMetadataPrompt("有界输入", oversizedPosts);
    expect(new TextEncoder().encode(prompt).byteLength).toBeLessThanOrEqual(
      64_000,
    );
    expect(prompt).not.toContain("x".repeat(201));
  });

  it("keeps the final JSON prompt under 64 KB with maximum current content", () => {
    const oversizedValue = "正文内容".repeat(10_000);
    const prompt = buildMetadataPrompt("最大输入测试", posts, {
      content: oversizedValue,
      excerpt: oversizedValue,
      currentTags: Array.from({ length: 30 }, () => oversizedValue),
      currentCategories: Array.from({ length: 15 }, () =>
        Array.from({ length: 10 }, () => oversizedValue),
      ),
    });
    expect(() => JSON.parse(prompt)).not.toThrow();
    expect(new TextEncoder().encode(prompt).byteLength).toBeLessThanOrEqual(
      64_000,
    );
  });

  it("truncates large existing editor metadata instead of rejecting it", () => {
    const parsed = aiMetadataRequestSchema.parse({
      title: "大字段",
      content: "文".repeat(30_000),
      excerpt: "摘要".repeat(2_000),
      currentTags: Array.from({ length: 20 }, () => "标签".repeat(100)),
      currentCategories: Array.from({ length: 10 }, () =>
        Array.from({ length: 8 }, () => "分类".repeat(100)),
      ),
    });
    expect(parsed.content).toHaveLength(20_000);
    expect(parsed.excerpt).toHaveLength(2_000);
    expect(parsed.currentTags).toHaveLength(12);
    expect(parsed.currentTags?.[0]).toHaveLength(80);
    expect(parsed.currentCategories).toHaveLength(5);
    expect(parsed.currentCategories?.[0]).toHaveLength(5);
  });

  it("accepts fenced JSON, normalizes values, and avoids slug collisions", () => {
    const value = extractModelJson(
      '```json\n{"slug":"ZJU Course Review","tags":["浙江大学","浙江大学","课程评价"],"categories":[["大学","课程测评"]]}\n```',
    );
    expect(
      normalizeMetadataSuggestion(value, new Set(["zju-course-review"])),
    ).toEqual({
      slug: "zju-course-review-2",
      tags: ["浙江大学", "课程评价"],
      categories: [["大学", "课程测评"]],
    });
  });

  it("retries one invalid model response without overwriting with bad data", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(completion("not json"))
      .mockResolvedValueOnce(
        completion(
          '{"slug":"freshman-course-summary","tags":["浙江大学","课程评价"],"categories":[["大学","课程测评"]]}',
        ),
      ) as unknown as typeof fetch;
    const result = await generateAiMetadata(
      config,
      { title: "新生课程总结" },
      posts,
      fetchImplementation,
    );
    expect(result.slug).toBe("freshman-course-summary");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const request = JSON.parse(
      String((vi.mocked(fetchImplementation).mock.calls[0][1] as RequestInit).body),
    );
    expect(request.reasoning_effort).toBe("none");
    expect(request.response_format.type).toBe("json_schema");
    expect(
      vi.mocked(fetchImplementation).mock.calls[0][1]?.redirect,
    ).toBe("error");
  });

  it("overrides a free-form model slug with the fixed semester-series slug", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      completion(
        '{"slug":"zju-freshman-course-review","tags":["浙江大学","课程评价"],"categories":[["大学","课程测评"]]}',
      ),
    ) as unknown as typeof fetch;
    const result = await generateAiMetadata(
      config,
      { title: "浙大大一下学期课程总结" },
      posts,
      fetchImplementation,
    );
    expect(result.slug).toBe("freshman-year-1-sem-2");
  });

  it("requires a key before calling DeepSeek", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    await expect(
      generateAiMetadata(
        {
          ...config,
          provider: "deepseek",
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-flash",
          apiKey: undefined,
        },
        { title: "测试" },
        posts,
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ code: "CONFIG_MISSING" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("uses DeepSeek JSON mode and its server-side authorization header", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      completion(
        '{"slug":"deepseek-result","tags":["写作","测试"],"categories":[["随笔"]]}',
      ),
    ) as unknown as typeof fetch;
    await generateAiMetadata(
      {
        ...config,
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        apiKey: "server-secret",
      },
      { title: "测试" },
      posts,
      fetchImplementation,
    );
    const request = JSON.parse(
      String((vi.mocked(fetchImplementation).mock.calls[0][1] as RequestInit).body),
    );
    const headers = vi.mocked(fetchImplementation).mock.calls[0][1]
      ?.headers as Record<string, string>;
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(headers.authorization).toBe("Bearer server-secret");
  });

  it("uses the current completion-token field for generic OpenAI-compatible APIs", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      completion(
        '{"slug":"openai-result","tags":["写作","测试"],"categories":[["随笔"]]}',
      ),
    ) as unknown as typeof fetch;
    await generateAiMetadata(
      {
        ...config,
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5-mini",
      },
      { title: "测试" },
      posts,
      fetchImplementation,
    );
    const request = JSON.parse(
      String((vi.mocked(fetchImplementation).mock.calls[0][1] as RequestInit).body),
    );
    expect(request.max_completion_tokens).toBe(512);
    expect(request).not.toHaveProperty("max_tokens");
    expect(request).not.toHaveProperty("temperature");
    expect(request.messages[0].role).toBe("developer");
  });

  it("turns connection failures into an actionable model-service error", async () => {
    const fetchImplementation = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
    await expect(
      generateAiMetadata(
        config,
        { title: "测试" },
        posts,
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 502 });
  });

  it("does not return an upstream error body in application-error details", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response("debug page containing server-secret", { status: 502 }),
    ) as unknown as typeof fetch;
    await expect(
      generateAiMetadata(
        config,
        { title: "测试" },
        posts,
        fetchImplementation,
      ),
    ).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      details: undefined,
    });
  });

  it("shares one timeout deadline across an invalid-response retry", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const fetchImplementation = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) => {
          attempts += 1;
          if (attempts === 1) {
            return new Promise<Response>((resolve) => {
              setTimeout(() => resolve(completion("not json")), 4_000);
            });
          }
          return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            const abort = () => reject(new Error("aborted"));
            if (signal?.aborted) abort();
            else signal?.addEventListener("abort", abort, { once: true });
          });
        },
      ) as unknown as typeof fetch;
      const result = expect(
        generateAiMetadata(
          config,
          { title: "测试总截止时间" },
          posts,
          fetchImplementation,
        ),
      ).rejects.toMatchObject({ code: "AI_TIMEOUT", status: 504 });
      await vi.advanceTimersByTimeAsync(4_000);
      await vi.advanceTimersByTimeAsync(1_000);
      await result;
      expect(fetchImplementation).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
