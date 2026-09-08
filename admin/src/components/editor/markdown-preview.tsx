"use client";

import { memo, useEffect, useId, useMemo, useState } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import { nodeText, previewHeadings } from "@/lib/preview-headings";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

let mermaidLoader: Promise<(typeof import("mermaid"))["default"]> | undefined;
let renderSequence = 0;

function loadMermaid() {
  mermaidLoader ??= import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
        suppressErrorRendering: true,
      });
      return mermaid;
    })
    .catch((error) => {
      mermaidLoader = undefined;
      throw error;
    });
  return mermaidLoader;
}

function MermaidBlock({ source }: { source: string }) {
  const [result, setResult] = useState<{
    source: string;
    svg?: string;
    error?: string;
  }>();
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadMermaid()
        .then(async (mermaid) => {
          if (cancelled) return;
          const rendered = await mermaid.render(
            `mermaid-preview-${++renderSequence}`,
            source,
          );
          if (!cancelled) setResult({ source, svg: rendered.svg });
        })
        .catch(() => {
          if (!cancelled)
            setResult({
              source,
              error: "Mermaid 图表无法渲染，请检查语法或稍后重试。",
            });
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source]);

  if (result?.source !== source)
    return (
      <div
        aria-label="正在渲染图表"
        className="skeleton"
        style={{ height: 120 }}
      />
    );
  if (result.error)
    return (
      <div className="alert danger" role="status">
        {result.error}
      </div>
    );
  return <div dangerouslySetInnerHTML={{ __html: result.svg || "" }} />;
}

// Stable component identities preserve diagram state across surrounding edits.
const previewComponents: Components = {
  pre: ({ node, children, ...props }) => {
    const code = node?.children[0];
    if (
      code?.type === "element" &&
      code.tagName === "code" &&
      Array.isArray(code.properties.className) &&
      code.properties.className.includes("language-mermaid")
    ) {
      return <MermaidBlock source={nodeText(code).replace(/\n$/, "")} />;
    }
    return <pre {...props}>{children}</pre>;
  },
  img: ({ alt, src, title, width, height }) => (
    // Markdown URLs are filtered by ReactMarkdown before reaching this component.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt || ""}
      src={src}
      title={title}
      width={width}
      height={height}
      loading="lazy"
    />
  ),
};
function transformAssetTags(
  markdown: string,
  postPath?: string,
  assetUrls: Record<string, string> = {},
) {
  return markdown.replace(
    /\{%\s*asset_img\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+(?:"([^"]+)"|'([^']+)'|([^%]+?)))?\s*%\}/g,
    (
      _match,
      doubleFile,
      singleFile,
      bareFile,
      doubleAlt,
      singleAlt,
      bareAlt,
    ) => {
      const file = doubleFile || singleFile || bareFile;
      const alt = (doubleAlt || singleAlt || bareAlt || file).trim();
      if (assetUrls[file]) return `![${alt}](${assetUrls[file]})`;
      if (!postPath) return `![${alt}](${file})`;
      const directory = postPath.replace(/\.md$/i, "");
      const path = `${directory}/${file}`;
      return `![${alt}](/api/media/content?path=${encodeURIComponent(path)})`;
    },
  );
}

export const MarkdownPreview = memo(function MarkdownPreview({
  markdown,
  postPath,
  assetUrls,
  hideOutline = false,
}: {
  markdown: string;
  postPath?: string;
  assetUrls?: Record<string, string>;
  hideOutline?: boolean;
}) {
  const source = useMemo(
    () => transformAssetTags(markdown, postPath, assetUrls),
    [assetUrls, markdown, postPath],
  );
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <article className="markdown-body">
      <ReactMarkdown
        components={previewComponents}
        rehypePlugins={[
          [previewHeadings, { prefix: `preview-${prefix}`, hideOutline }],
          rehypeKatex,
          rehypeHighlight,
        ]}
        remarkPlugins={[remarkGfm, remarkMath]}
        urlTransform={(url) =>
          url.startsWith("blob:") ? url : defaultUrlTransform(url)
        }
      >
        {source}
      </ReactMarkdown>
    </article>
  );
});
