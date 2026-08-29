import { describe, expect, it } from "vitest";
import { isMediaReferenced } from "@/lib/media-usage";
import type { MediaAsset } from "@/lib/types";

const globalMedia: MediaAsset = {
  id: "global",
  name: "cover.png",
  path: "source/img/cover.png",
  scope: "global",
  sha: "a".repeat(40),
  size: 10,
};

describe("media usage", () => {
  it("finds public image paths in article bodies", () => {
    expect(
      isMediaReferenced(
        { body: "![封面](/img/cover.png)", slug: "hello" },
        globalMedia,
      ),
    ).toBe(true);
  });

  it("only associates post assets with their owning post", () => {
    const postMedia: MediaAsset = {
      ...globalMedia,
      id: "post",
      name: "photo.png",
      path: "source/_posts/hello/photo.png",
      postSlug: "hello",
      scope: "post",
    };
    expect(
      isMediaReferenced(
        { body: '{% asset_img "photo.png" "照片" %}', slug: "hello" },
        postMedia,
      ),
    ).toBe(true);
    expect(
      isMediaReferenced(
        { body: '{% asset_img "photo.png" "照片" %}', slug: "other" },
        postMedia,
      ),
    ).toBe(false);
  });
});
