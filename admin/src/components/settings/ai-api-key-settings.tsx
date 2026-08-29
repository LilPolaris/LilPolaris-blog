"use client";

import { CircleCheck, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import type { AiMetadataStatus } from "@/lib/ai-config";

async function readResponse(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || fallback);
  }
  return payload.data;
}

export function AiApiKeySettings({
  initialStatus,
}: {
  initialStatus: AiMetadataStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | "">("");
  const [message, setMessage] = useState("");

  async function saveAndTest() {
    const value = apiKey.trim();
    if (value.length < 10) {
      setMessage("请粘贴完整的 API Key。");
      return;
    }
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: value }),
      });
      const data = await readResponse(response, "API Key 保存失败。");
      setStatus(data.status);
      setApiKey("");
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "API Key 保存失败。");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm("删除当前浏览器中加密保存的 AI API Key？")) return;
    setBusy("delete");
    setMessage("");
    try {
      const response = await fetch("/api/ai/settings", { method: "DELETE" });
      const data = await readResponse(response, "API Key 删除失败。");
      setStatus(data.status);
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "API Key 删除失败。");
    } finally {
      setBusy("");
    }
  }

  const sourceLabel =
    status.source === "encrypted-cookie"
      ? "当前浏览器已加密保存"
      : status.source === "environment"
        ? "服务端环境变量已配置"
        : "尚未配置";

  return (
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header">
        <h2 className="panel-title">AI 文章属性</h2>
        <span className={`badge${status.configured ? " success" : " danger"}`}>
          {status.configured ? <CircleCheck size={13} /> : <KeyRound size={13} />}
          {sourceLabel}
        </span>
      </div>
      <div className="panel-body">
        <div className="alert" style={{ marginBottom: 20 }}>
          <ShieldCheck size={18} />
          <div>
            当前使用 <strong>{status.model}</strong>。Key 会先做真实连接测试，再由
            AUTH_SECRET 加密并写入 HttpOnly Cookie；不会进入 Local Storage、普通设置或仓库。
            点击生成时会发送当前文章的标题、截断正文/摘要和历史已发布文章元数据，
            不会发送其他草稿。
          </div>
        </div>
        {status.browserKeySupported ? (
          <>
            <div className="form-grid">
              <label className="field span-2">
                <span className="field-label">DeepSeek API Key</span>
                <input
                  autoComplete="new-password"
                  className="input post-slug"
                  disabled={Boolean(busy)}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={status.configured ? "已配置；粘贴新 Key 可替换" : "粘贴 API Key"}
                  spellCheck={false}
                  type="password"
                  value={apiKey}
                />
                <span className="field-help">这里只显示配置状态，保存后不会回显 Key 明文。</span>
              </label>
            </div>
            <div className="button-group" style={{ marginTop: 16 }}>
              <button
                className="button primary"
                disabled={Boolean(busy) || apiKey.trim().length < 10}
                onClick={() => void saveAndTest()}
                type="button"
              >
                <KeyRound size={15} />
                {busy === "save" ? "正在测试并保存…" : "保存并测试 API Key"}
              </button>
            </div>
          </>
        ) : (
          <div className="alert">
            当前 Provider 为 {status.provider}，浏览器保存的 DeepSeek Key 不会发送给它；
            请通过服务端环境变量配置该 Provider。
          </div>
        )}
        {status.browserKeyStored ? (
          <div className="button-group" style={{ marginTop: 16 }}>
            <button
              className="button danger"
              disabled={Boolean(busy)}
              onClick={() => void remove()}
              type="button"
            >
              <Trash2 size={15} />
              {busy === "delete" ? "正在删除…" : "删除浏览器 Key"}
            </button>
          </div>
        ) : null}
        {message ? (
          <div aria-live="polite" className="alert" style={{ marginTop: 16 }}>
            {message}
          </div>
        ) : null}
      </div>
    </section>
  );
}
