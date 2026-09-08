import type { Element, Root, RootContent } from "hast";

export function nodeText(node: Root | RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element" && node.tagName === "img") {
    return String(node.properties.alt || "");
  }
  return "children" in node ? node.children.map(nodeText).join("") : "";
}

function element(
  tagName: string,
  children: Element["children"],
  properties = {},
): Element {
  return { type: "element", tagName, properties, children };
}

// Derive both IDs and navigation from the same parsed tree. This avoids a
// second Markdown parse and keeps inline formatting and duplicate titles aligned.
export function previewHeadings({
  prefix,
  hideOutline,
}: {
  prefix: string;
  hideOutline: boolean;
}) {
  return (tree: Root) => {
    const used = new Set<string>();
    const headings: Array<{ id: string; label: string; depth: number }> = [];
    function walk(node: Root | RootContent) {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName)) {
        const label = nodeText(node);
        const slug =
          label
            .toLowerCase()
            .trim()
            .replace(/[^\p{L}\p{N}\s-]/gu, "")
            .replace(/\s+/g, "-") || "section";
        const base = `${prefix}-${slug}`;
        let id = base;
        let suffix = 1;
        while (used.has(id)) id = `${base}-${suffix++}`;
        used.add(id);
        node.properties.id = id;
        const depth = Number(node.tagName[1]);
        if (depth <= 3) headings.push({ id, label, depth });
      }
      if ("children" in node) node.children.forEach(walk);
    }
    walk(tree);
    if (hideOutline || headings.length < 3) return;
    tree.children.unshift(
      element(
        "details",
        [
          element("summary", [{ type: "text", value: "目录" }]),
          element(
            "ol",
            headings.map(({ id, label, depth }) =>
              element(
                "li",
                [
                  element("a", [{ type: "text", value: label }], {
                    href: `#${id}`,
                  }),
                ],
                { className: [`outline-depth-${depth}`] },
              ),
            ),
          ),
        ],
        { className: ["preview-outline"] },
      ),
    );
  };
}
