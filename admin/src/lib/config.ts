import { z } from "zod";
import { AppError } from "@/lib/errors";
import { normalizeRepoPath } from "@/lib/path";
import type {
  AiMetadataConfig,
  PostPreset,
  RepositoryConfig,
} from "@/lib/types";

export const DEFAULT_POST_PRESETS: PostPreset[] = [
  {
    id: "rambling",
    label: "随笔",
    slugTemplate: "rambling-{seq:02}",
    titleTemplate: "随笔-{seq:02}",
    tags: [],
    categories: [["随笔"]],
    layout: "post",
  },
];

const optionalBoolean = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const timezoneSchema = z.string().default("Asia/Shanghai").refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  },
  "BLOG_TIMEZONE 不是有效的 IANA 时区。",
);

const envSchema = z.object({
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().default("LilPolaris"),
  GITHUB_REPO: z.string().default("LilPolaris-blog"),
  GITHUB_BRANCH: z.string().default("main"),
  HEXO_POSTS_PATH: z.string().default("source/_posts"),
  HEXO_DRAFTS_PATH: z.string().default("source/_drafts"),
  HEXO_IMAGES_PATH: z.string().default("source/img"),
  PUBLIC_BLOG_URL: z.string().url().default("https://lilpolaris.github.io"),
  BLOG_TIMEZONE: timezoneSchema,
  GITHUB_WORKFLOW_ID: z.string().default("deploy.yml"),
  DEFAULT_LAYOUT: z.string().default("post"),
  DEFAULT_CATEGORY: z.string().default(""),
  DEFAULT_COMMIT_TEMPLATE: z.string().default("content: {action} post {slug}"),
  EDITOR_DEFAULT_MODE: z.enum(["live", "source"]).default("live"),
  AUTO_DISPATCH_WORKFLOW: optionalBoolean,
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(25).default(8),
  REPOSITORY_ADAPTER: z.enum(["github", "mock"]).default("github"),
  AUTH_MODE: z.enum(["oauth", "local-cli"]).default("oauth"),
  CONTENT_WRITE_POLICY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  ADMIN_GITHUB_LOGIN: z.string().default("LilPolaris"),
  AUTH_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  AI_PROVIDER: z
    .enum(["ollama", "deepseek", "openai-compatible"])
    .default("deepseek"),
  AI_BASE_URL: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "AI_BASE_URL 必须使用 HTTP 或 HTTPS。")
    .optional(),
  AI_MODEL: z.string().trim().min(1).max(200).optional(),
  AI_API_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),
});

export type Environment = z.infer<typeof envSchema>;

let cachedEnvironment: Environment | undefined;

export function getEnvironment(): Environment {
  cachedEnvironment ??= envSchema.parse(process.env);
  return cachedEnvironment;
}

export function getBaseRepositoryConfig(): RepositoryConfig {
  const env = getEnvironment();
  return {
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH,
    postsPath: normalizeRepoPath(env.HEXO_POSTS_PATH),
    draftsPath: normalizeRepoPath(env.HEXO_DRAFTS_PATH),
    imagesPath: normalizeRepoPath(env.HEXO_IMAGES_PATH),
    publicBlogUrl: env.PUBLIC_BLOG_URL.replace(/\/+$/, ""),
    timezone: env.BLOG_TIMEZONE,
    workflowId: env.GITHUB_WORKFLOW_ID,
    defaultLayout: env.DEFAULT_LAYOUT,
    defaultCategory: env.DEFAULT_CATEGORY,
    commitTemplate: env.DEFAULT_COMMIT_TEMPLATE,
    autoDispatch: env.AUTO_DISPATCH_WORKFLOW,
    uploadLimitMb: env.MAX_UPLOAD_MB,
    adapter: env.REPOSITORY_ADAPTER,
    editorDefaultMode: env.EDITOR_DEFAULT_MODE,
    postPresets: DEFAULT_POST_PRESETS,
  };
}

export function getAiMetadataConfig(): AiMetadataConfig {
  const env = getEnvironment();
  const defaults = {
    deepseek: {
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    },
    ollama: {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen3.5:9b",
    },
    "openai-compatible": {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5-mini",
    },
  }[env.AI_PROVIDER];
  return {
    provider: env.AI_PROVIDER,
    baseUrl: (env.AI_BASE_URL || defaults.baseUrl).replace(/\/+$/, ""),
    model: env.AI_MODEL || defaults.model,
    apiKey:
      env.AI_API_KEY || (env.AI_PROVIDER === "ollama" ? "ollama" : undefined),
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}

export function configurationStatus() {
  const env = getEnvironment();
  const missing: string[] = [];
  if (!env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (env.AUTH_MODE === "oauth") {
    if (!env.AUTH_GITHUB_ID) missing.push("AUTH_GITHUB_ID");
    if (!env.AUTH_GITHUB_SECRET) missing.push("AUTH_GITHUB_SECRET");
  }
  if (env.REPOSITORY_ADAPTER === "github" && !env.GITHUB_TOKEN) {
    missing.push("GITHUB_TOKEN");
  }
  return {
    configured: missing.length === 0,
    missing,
    authConfigured:
      Boolean(env.AUTH_SECRET) &&
      (env.AUTH_MODE === "local-cli" ||
        Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET)),
    repositoryConfigured:
      env.REPOSITORY_ADAPTER === "mock" || Boolean(env.GITHUB_TOKEN),
  };
}

export function requireGitHubToken() {
  const token = getEnvironment().GITHUB_TOKEN;
  if (!token) {
    throw new AppError(
      "CONFIG_MISSING",
      "尚未配置 GITHUB_TOKEN。可以先使用 Mock 模式，或在服务端环境变量中提供 Token。",
      503,
      { missing: ["GITHUB_TOKEN"] },
    );
  }
  return token;
}

export function getRepositoryWriteGuardEnvironment() {
  const env = getEnvironment();
  return {
    authMode: env.AUTH_MODE,
    contentWritePolicy: env.CONTENT_WRITE_POLICY,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelTargetEnv: process.env.VERCEL_TARGET_ENV,
  };
}
