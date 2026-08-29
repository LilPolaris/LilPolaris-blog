"use client";

import { useEffect, useId, useMemo, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function headingId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function MermaidBlock({ source }: { source: string }) {
  const id = useId().replaceAll(":", "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          suppressErrorRendering: true,
        });
        const result = await mermaid.render(`mermaid-${id}`, source);
        if (!cancelled) setSvg(result.svg);
      })
      .catch(() => {
        if (!cancelled) setError("Mermaid 图表语法有误。");
      });
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (error) return <div className="alert danger">{error}</div>;
  if (!svg) return <div className="skeleton" style={{ height: 120 }} />;
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}

function transformAssetTags(
  markdown: string,
  postPath?: string,
  assetUrls: Record<string, string> = {},
) {
  return markdown.replace(
    /\{%\s*asset_img\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+(?:"([^"]+)"|'([^']+)'|([^%]+?)))?\s*%\}/g,
    (_match, doubleFile, singleFile, bareFile, doubleAlt, singleAlt, bareAlt) => {
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

export function MarkdownPreview({
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
  const headings = useMemo(
    () =>
      source
        .split(/\r?\n/)
        .map((line) => line.match(/^(#{1,3})\s+(.+)$/))
        .filter(Boolean)
        .map((match) => ({
          depth: match![1].length,
          label: match![2].replace(/[*_`[\]]/g, ""),
        })),
    [source],
  );

  return (
    <article className="markdown-body">
      {!hideOutline && headings.length > 2 ? (
        <details
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            marginBottom: 24,
            padding: "10px 14px",
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 620 }}>目录</summary>
          <ol style={{ margin: "10px 0 0", paddingLeft: 20 }}>
            {headings.map((heading, index) => (
              <li
                key={`${heading.label}-${index}`}
                style={{ marginLeft: (heading.depth - 1) * 12 }}
              >
                <a href={`#${headingId(heading.label)}`}>{heading.label}</a>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 id={headingId(String(children))}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 id={headingId(String(children))}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 id={headingId(String(children))}>{children}</h3>
          ),
          code: ({ className, children, ...props }) => {
            const language = /language-(\w+)/.exec(className || "")?.[1];
            const value = String(children).replace(/\n$/, "");
            if (language === "mermaid") {
              return <MermaidBlock source={value} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          img: ({ alt, ...props }) => (
            // Markdown image sources are intentionally rendered after ReactMarkdown URL filtering.
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={alt || ""} loading="lazy" {...props} />
          ),
        }}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        remarkPlugins={[remarkGfm, remarkMath]}
        urlTransform={(url) =>
          url.startsWith("blob:") ? url : defaultUrlTransform(url)
        }
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}
