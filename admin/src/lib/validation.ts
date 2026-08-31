import { z } from "zod";
import { isValidBlogTimestamp } from "@/lib/blog-time";

const categoriesSchema = z.array(z.array(z.string().trim().min(1)));

export const frontMatterSchema = z.object({
  title: z.string().trim().min(1, "文章标题不能为空。"),
  date: z.string(),
  firstPublishedAt: z.string().refine(
    isValidBlogTimestamp,
    "首次上线时间必须为空或使用 YYYY-MM-DD HH:mm:ss 格式，且日期真实有效。",
  ),
  updated: z.string(),
  slug: z.string().min(1),
  tags: z.array(z.string().trim().min(1)),
  categories: categoriesSchema,
  excerpt: z.string(),
  cover: z.string(),
  draft: z.boolean(),
  layout: z.string(),
  permalink: z.string(),
});

export const postMutationSchema = z.object({
  currentPath: z.string().optional(),
  expectedSha: z.string().optional(),
  expectedHeadSha: z.string().optional(),
  kind: z.enum(["post", "draft"]),
  slug: z.string().min(1),
  body: z.string(),
  frontMatter: frontMatterSchema,
  force: z.boolean().optional(),
});

export const stageMediaMetadataSchema = z.object({
  id: z.string().min(1).max(100),
  referenceName: z.string().min(1).max(200),
  originalName: z.string().min(1).max(200),
});

export const postBundleRequestSchema = z.object({
  post: postMutationSchema,
  mediaReceipts: z.array(z.string().min(1).max(4_096)).max(40),
});

export const duplicateSchema = z.object({
  action: z.literal("duplicate"),
  path: z.string(),
  expectedSha: z.string(),
  targetSlug: z.string(),
});

export const taxonomySchema = z.object({
  type: z.enum(["tag", "category"]),
  from: z.string().trim().min(1),
  fromPath: z
    .array(z.string().trim().min(1).max(50))
    .min(1)
    .max(5)
    .optional(),
  to: z.string().trim().min(1),
  expectedHeadSha: z.string().optional(),
});
