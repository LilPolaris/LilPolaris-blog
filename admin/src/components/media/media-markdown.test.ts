import { describe, expect, it } from "vitest";
import {
  isPotentiallyUnused,
  mediaMarkdown,
} from "@/components/media/media-markdown";
import type { MediaAsset } from "@/lib/types";

const globalAsset: MediaAsset = {
  id: "global",
  path: "source/img/cover.png",
  name: "cover.png",
  sha: "abc",
  size: 12,
  scope: "global",
};
const postAsset: MediaAsset = {
  ...globalAsset,
  id: "post",
  path: "source/_posts/hello/photo.png",
  name: "photo.png",
  scope: "post",
  postSlug: "hello",
};

describe("mediaMarkdown", () => {
  it("creates a public Markdown image path", () => {
    expect(mediaMarkdown(globalAsset, "封面")).toBe("![封面](/img/cover.png)");
  });

  it("creates a Hexo post asset tag", () => {
    expect(mediaMarkdown(postAsset, "照片")).toBe(
      '{% asset_img "photo.png" "照片" %}',
    );
  });
});

describe("isPotentiallyUnused", () => {
  it("only marks an orphaned post asset as potentially unused", () => {
    expect(isPotentiallyUnused(postAsset, new Set(["another-post"]))).toBe(true);
    expect(isPotentiallyUnused(postAsset, new Set(["hello"]))).toBe(false);
    expect(isPotentiallyUnused(globalAsset, new Set())).toBeUndefined();
  });
});
