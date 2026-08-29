import { z } from "zod";
import type { RepositoryConfig } from "@/lib/types";

const githubOwnerSchema = z
  .string()
  .trim()
  .min(1, "GitHub Owner 不能为空。")
  .max(100)
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/,
    "GitHub Owner 只能包含字母、数字和中划线，且不能以中划线开头或结尾。",
  );

const githubRepoSchema = z
  .string()
  .trim()
  .min(1, "GitHub Repository 不能为空。")
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "GitHub Repository 含有不支持的字符。")
  .refine((value) => value !== "." && value !== "..", "仓库名称不合法。");

const branchSchema = z
  .string()
  .trim()
  .min(1, "Branch 不能为空。")
  .max(200)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.endsWith("/") &&
      !value.endsWith(".") &&
      !value.includes("..") &&
      !value.includes("//") &&
      !value.includes("@{") &&
      !/[\s~^:?*\[\\\x00-\x1f\x7f]/.test(value),
    "Branch 不是有效的 Git 引用名称。",
  );

const repoPathSchema = z
  .string()
  .trim()
  .min(1, "仓库路径不能为空。")
  .max(500)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.endsWith("/") &&
      !value.includes("\\") &&
      value.split("/").every((part) => part && part !== "." && part !== ".."),
    "仓库路径必须是无首尾斜杠、且不含 .、.. 或反斜杠的相对路径。",
  );

const httpUrlSchema = z
  .string()
  .trim()
  .url("Public Blog URL 不是有效网址。")
  .refine((value) => /^https?:\/\//i.test(value), "博客地址必须使用 HTTP 或 HTTPS。");

const workflowSchema = z
  .string()
  .trim()
  .max(200)
  .refine(
    (value) =>
      !value ||
      (!value.includes("\\") &&
        !value.split("/").some((part) => !part || part === "." || part === "..") &&
        /^[A-Za-z0-9._/-]+$/.test(value)),
    "Workflow 必须是安全的文件名或相对路径。",
  );

const postPresetSchema = z.object({
  id: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1, "模板按钮名称不能为空。").max(30),
  slugTemplate: z.string().trim().min(1, "文件名模板不能为空。").max(120),
  titleTemplate: z.string().trim().min(1, "标题模板不能为空。").max(120),
  tags: z.array(z.string().trim().min(1).max(50)).max(12),
  categories: z
    .array(z.array(z.string().trim().min(1).max(50)).min(1).max(5))
    .max(5),
  layout: z.string().trim().max(50),
});

export const settingsOverridesSchema = z
  .object({
    owner: githubOwnerSchema.optional(),
    repo: githubRepoSchema.optional(),
    branch: branchSchema.optional(),
    postsPath: repoPathSchema.optional(),
    draftsPath: repoPathSchema.optional(),
    imagesPath: repoPathSchema.optional(),
    publicBlogUrl: httpUrlSchema.optional(),
    workflowId: workflowSchema.optional(),
    defaultLayout: z.string().trim().max(50).optional(),
    defaultCategory: z.string().trim().max(100).optional(),
    commitTemplate: z.string().trim().max(300).optional(),
    autoDispatch: z.boolean().optional(),
    editorDefaultMode: z.enum(["live", "source"]).optional(),
    postPresets: z.array(postPresetSchema).max(8).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const paths = [
      ["postsPath", value.postsPath],
      ["draftsPath", value.draftsPath],
      ["imagesPath", value.imagesPath],
    ] as const;
    for (let index = 0; index < paths.length; index += 1) {
      const [name, path] = paths[index];
      if (!path) continue;
      for (const [, otherPath] of paths.slice(index + 1)) {
        if (
          otherPath &&
          (path === otherPath ||
            path.startsWith(`${otherPath}/`) ||
            otherPath.startsWith(`${path}/`))
        ) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: "文章、草稿和公共图片路径不能相同或互相嵌套。",
          });
        }
      }
    }
    const ids = new Set<string>();
    value.postPresets?.forEach((preset, index) => {
      if (ids.has(preset.id)) {
        context.addIssue({
          code: "custom",
          path: ["postPresets", index, "id"],
          message: "模板 ID 不能重复。",
        });
      }
      ids.add(preset.id);
    });
  });

export type SettingsOverrides = z.infer<typeof settingsOverridesSchema>;

export function settingsOverridesFromConfig(
  config: RepositoryConfig,
): SettingsOverrides {
  return {
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    postsPath: config.postsPath,
    draftsPath: config.draftsPath,
    imagesPath: config.imagesPath,
    publicBlogUrl: config.publicBlogUrl,
    workflowId: config.workflowId,
    defaultLayout: config.defaultLayout,
    defaultCategory: config.defaultCategory,
    commitTemplate: config.commitTemplate,
    autoDispatch: config.autoDispatch,
    editorDefaultMode: config.editorDefaultMode,
    postPresets: config.postPresets,
  };
}
