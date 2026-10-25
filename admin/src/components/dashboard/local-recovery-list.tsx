"use client";

import { entries } from "idb-keyval";
import { HardDriveDownload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  encodePostPathId,
  NEW_ARTICLE_RECOVERY_PATH,
  RECOVERY_KEY_PREFIX,
} from "@/lib/article-editor-utils";
import { formatRelative } from "@/lib/format";

interface RecoveryEntry {
  path: string;
  title: string;
  savedAt: number;
  pendingImages: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Lists editor recovery copies that only live in this browser. They are the
 * work most likely to be lost, so the dashboard surfaces them first.
 */
export function LocalRecoveryList() {
  const [items, setItems] = useState<RecoveryEntry[]>([]);

  useEffect(() => {
    let active = true;
    void entries()
      .then((rows) => {
        if (!active) return;
        const found = rows.flatMap(([key, value]) => {
          if (typeof key !== "string" || !key.startsWith(RECOVERY_KEY_PREFIX)) {
            return [];
          }
          if (!isRecord(value)) return [];
          const frontMatter = isRecord(value.frontMatter) ? value.frontMatter : {};
          return [
            {
              path: key.slice(RECOVERY_KEY_PREFIX.length),
              title:
                typeof frontMatter.title === "string" && frontMatter.title.trim()
                  ? frontMatter.title
                  : "未命名文章",
              savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
              pendingImages: Array.isArray(value.pendingMedia)
                ? value.pendingMedia.length
                : 0,
            },
          ];
        });
        setItems(found.sort((a, b) => b.savedAt - a.savedAt));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!items.length) return null;

  return (
    <section className="panel recovery-panel" aria-label="本地未提交的修改">
      <div className="panel-header">
        <h2 className="panel-title">
          <HardDriveDownload aria-hidden="true" size={15} />
          只在本机保存的修改
        </h2>
        <span className="badge warning">{items.length} 篇未提交</span>
      </div>
      <ul className="list">
        {items.map((item) => {
          const href =
            item.path === NEW_ARTICLE_RECOVERY_PATH
              ? "/posts/new"
              : `/posts/${encodePostPathId(item.path)}/edit`;
          return (
            <li className="list-item" key={item.path}>
              <div style={{ minWidth: 0 }}>
                <Link className="list-primary" href={href}>
                  {item.title}
                </Link>
                <div className="list-secondary">
                  {item.path === NEW_ARTICLE_RECOVERY_PATH
                    ? "新文章"
                    : item.path.split("/").at(-1)}
                  {" · "}
                  {formatRelative(item.savedAt)}
                  {item.pendingImages ? ` · ${item.pendingImages} 张图片待上传` : ""}
                </div>
              </div>
              <Link className="button" href={href}>
                继续编辑
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
