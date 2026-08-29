"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ImageIcon, RefreshCw, Search, X } from "lucide-react";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import {
  defaultMediaAlt,
  mediaMarkdown,
} from "@/components/media/media-markdown";
import type { MediaAsset } from "@/lib/types";

export interface MediaPickerSelection {
  alt: string;
  asset: MediaAsset;
  markdown: string;
}

export function MediaPickerDialog({
  currentPostSlug,
  onSelect,
  trigger,
}: {
  currentPostSlug?: string;
  onSelect: (selection: MediaPickerSelection) => void;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState<MediaAsset[]>();
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const selected = media?.find((item) => item.path === selectedPath);
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (media || []).filter(
      (item) =>
        (!normalized ||
          `${item.name} ${item.path}`.toLowerCase().includes(normalized)) &&
        (item.scope === "global" || item.postSlug === currentPostSlug),
    );
  }, [currentPostSlug, media, query]);

  async function loadMedia() {
    if (media || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/media");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "媒体读取失败。");
      }
      setMedia(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "媒体读取失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void loadMedia();
      }}
      open={open}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="panel dialog-card media-picker-dialog">
          <div className="panel-header">
            <Dialog.Title className="panel-title">从媒体库选择图片</Dialog.Title>
            <Dialog.Description className="sr-only">
              选择公共媒体或当前文章的资源，并填写图片替代文本。
            </Dialog.Description>
            <Dialog.Close asChild>
              <button aria-label="关闭" className="icon-button ghost" type="button">
                <X size={17} />
              </button>
            </Dialog.Close>
          </div>
          <div className="panel-body">
            <label style={{ display: "block", position: "relative" }}>
              <Search
                aria-hidden="true"
                size={15}
                style={{ left: 11, position: "absolute", top: 11 }}
              />
              <input
                aria-label="搜索媒体库"
                className="input"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索公共媒体或当前文章资源"
                style={{ paddingLeft: 34 }}
                value={query}
              />
            </label>
            {error ? (
              <div className="alert danger media-picker-error">
                <span>{error}</span>
                <button className="button" onClick={() => void loadMedia()} type="button">
                  <RefreshCw size={14} />
                  重试
                </button>
              </div>
            ) : null}
            {loading ? (
              <div className="empty-state" style={{ minHeight: 220 }}>
                正在读取媒体库…
              </div>
            ) : media ? (
              <div className="media-picker-grid">
                {visible.map((item) => (
                  <button
                    aria-pressed={selectedPath === item.path}
                    className={`media-picker-item${selectedPath === item.path ? " selected" : ""}`}
                    key={item.path}
                    onClick={() => {
                      setSelectedPath(item.path);
                      setAlt(defaultMediaAlt(item));
                    }}
                    type="button"
                  >
                    <span className="media-picker-preview">
                      {item.downloadUrl ? (
                        // Protected media URLs cannot be handled by next/image without exposing auth.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" loading="lazy" src={item.downloadUrl} />
                      ) : (
                        <ImageIcon aria-hidden="true" size={24} />
                      )}
                    </span>
                    <span title={item.path}>{item.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {selected ? (
              <label className="field" style={{ marginTop: 14 }}>
                <span className="field-label">图片替代文本（alt）</span>
                <input
                  className="input"
                  maxLength={300}
                  onChange={(event) => setAlt(event.target.value)}
                  value={alt}
                />
                <span className="field-help">将插入：{mediaMarkdown(selected, alt)}</span>
              </label>
            ) : null}
            <div className="button-group dialog-actions">
              <Dialog.Close asChild>
                <button className="button" type="button">取消</button>
              </Dialog.Close>
              <button
                className="button primary"
                disabled={!selected}
                onClick={() => {
                  if (!selected) return;
                  onSelect({ asset: selected, alt, markdown: mediaMarkdown(selected, alt) });
                  setOpen(false);
                }}
                type="button"
              >
                插入图片
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
