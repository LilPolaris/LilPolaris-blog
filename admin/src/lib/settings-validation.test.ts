import { describe, expect, it } from "vitest";
import { settingsOverridesSchema } from "@/lib/settings-validation";

const valid = {
  owner: "LilPolaris",
  repo: "LilPolaris-blog",
  branch: "main",
  postsPath: "source/_posts",
  draftsPath: "source/_drafts",
  imagesPath: "source/img",
  publicBlogUrl: "https://lilpolaris.github.io",
  workflowId: "deploy.yml",
};

describe("settingsOverridesSchema", () => {
  it("accepts safe repository and path settings", () => {
    expect(settingsOverridesSchema.parse(valid)).toEqual(valid);
  });

  it("rejects repository path traversal", () => {
    const result = settingsOverridesSchema.safeParse({
      ...valid,
      postsPath: "source/../secrets",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overlapping content roots", () => {
    const result = settingsOverridesSchema.safeParse({
      ...valid,
      imagesPath: "source/_posts/images",
    });
    expect(result.success).toBe(false);
  });

  it("only accepts HTTP blog URLs", () => {
    const result = settingsOverridesSchema.safeParse({
      ...valid,
      publicBlogUrl: "file:///etc/passwd",
    });
    expect(result.success).toBe(false);
  });
});
