import { markdownLanguage } from "@codemirror/lang-markdown";

// Use the editor's Markdown grammar so fences, indentation and setext headings
// are treated the same way in the document and its navigation sidebar.
export function markdownOutline(source: string) {
  const headings: Array<{ level: number; label: string; position: number }> =
    [];
  markdownLanguage.parser.parse(source).iterate({
    enter(node) {
      const match = /^(ATX|Setext)Heading([1-4])$/.exec(node.name);
      if (!match) return;
      const text = source.slice(node.from, node.to);
      const label = (
        match[1] === "ATX"
          ? text.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "")
          : text.replace(/\r?\n[^\n]*$/, "")
      )
        .replace(/!?(\[([^\]]+)\])\([^)]*\)/g, "$2")
        .replace(/[*_`]/g, "")
        .trim();
      headings.push({ level: Number(match[2]), label, position: node.from });
      return false;
    },
  });
  return headings;
}
