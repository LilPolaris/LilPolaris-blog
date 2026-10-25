import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const SEMANTIC_TAGS =
  /<(?:p|h[1-6]|ul|ol|li|blockquote|pre|table|strong|b|em|i|a\s|img|br)\b/i;

/**
 * Rich clipboard content is converted only when it carries document structure.
 * Code editors put syntax-highlighted spans on the clipboard as HTML; those
 * pastes must stay plain text or code would be mangled.
 */
export function shouldConvertPastedHtml(html: string, types: readonly string[]) {
  if (!html.trim()) return false;
  if (types.includes("vscode-editor-data")) return false;
  if (/data-pm-slice|class="?cm-line/.test(html)) return false;
  return SEMANTIC_TAGS.test(html);
}

let service: TurndownService | null = null;

function turndown() {
  if (service) return service;
  service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  service.use(gfm);
  service.remove(["style", "script", "meta", "title", "noscript"]);
  // Turndown pads list markers to four columns; match how the posts are
  // written by hand instead ("- item", "1. item").
  service.addRule("compactListItem", {
    filter: "li",
    replacement(content, node, options) {
      const item = node as HTMLElement;
      const parent = item.parentNode as HTMLElement | null;
      let prefix = `${options.bulletListMarker} `;
      if (parent?.nodeName === "OL") {
        const start = Number(parent.getAttribute("start") || 1);
        prefix = `${start + Array.prototype.indexOf.call(parent.children, item)}. `;
      }
      const body = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "\n")
        .replace(/\n(?=.)/g, `\n${" ".repeat(prefix.length)}`);
      return `${prefix}${body}${item.nextSibling && !body.endsWith("\n") ? "\n" : ""}`;
    },
  });
  // Inline base64 images would bloat the article; uploaded or linked images
  // are inserted through the editor's image tools instead.
  service.addRule("dropInlineImages", {
    filter: (node) =>
      node.nodeName === "IMG" &&
      /^data:/i.test((node as HTMLImageElement).getAttribute("src") || ""),
    replacement: () => "",
  });
  return service;
}

export function pastedHtmlToMarkdown(html: string) {
  const fragment = html
    .replace(/^[\s\S]*?<!--StartFragment-->/, "")
    .replace(/<!--EndFragment-->[\s\S]*$/, "");
  return turndown()
    .turndown(fragment)
    .replace(/ /g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
