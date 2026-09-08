import { describe, expect, it } from "vitest";
import { markdownOutline } from "./markdown-outline";

describe("editor outline", () => {
  it("ignores code and handles real ATX and setext headings with source positions", () => {
    const source =
      "# 开始\n\n```md\n# 示例不是标题\n```\n\n    # 缩进代码\n\n小节\n---\n\n## **重复** [链接](https://example.com) ##\n\n## 重复\n";
    const headings = markdownOutline(source);
    expect(headings.map(({ label, level }) => ({ label, level }))).toEqual([
      { label: "开始", level: 1 },
      { label: "小节", level: 2 },
      { label: "重复 链接", level: 2 },
      { label: "重复", level: 2 },
    ]);
    expect(headings[1].position).toBe(source.indexOf("小节"));
    expect(headings[3].position).toBe(source.lastIndexOf("## 重复"));
  });
});
