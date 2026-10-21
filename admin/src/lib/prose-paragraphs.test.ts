import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitProseLines } from "@/lib/prose-paragraphs";

// Shared with the Hexo build so the preview splits paragraphs the same way.
const cases: { name: string; input: string; expected: string }[] = JSON.parse(
  readFileSync(
    new URL("../../../tools/fixtures/prose-paragraphs.cases.json", import.meta.url),
    "utf8",
  ),
);

describe("splitProseLines", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    expect(splitProseLines(input)).toBe(expected);
  });
});
