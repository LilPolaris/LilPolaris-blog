"use client";

import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Link2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  settingsOverridesFromConfig,
  settingsOverridesSchema,
} from "@/lib/settings-validation";
import type { PostPreset, RepositoryConfig } from "@/lib/types";

interface StorageStatus {
  bytes: number;
  maxBytes: number;
}

export function SettingsForm({
  initialConfig,
  tokenConfigured,
}: {
  initialConfig: RepositoryConfig;
  tokenConfigured: boolean;
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [savedConfig, setSavedConfig] = useState(initialConfig);
  const [busy, setBusy] = useState<"" | "save" | "reset" | "test">("");
  const [message, setMessage] = useState("");
  const [storage, setStorage] = useState<StorageStatus>();
  const editRevisionRef = useRef(0);
  const repositoryScopeLocked = initialConfig.adapter === "github";
  const requestPayload = useMemo(
    () => settingsOverridesFromConfig(config),
    [config],
  );
  const validation = useMemo(
    () => settingsOverridesSchema.safeParse(requestPayload),
    [requestPayload],
  );
  const validationErrors = validation.success
    ? []
    : [...new Set(validation.error.issues.map((issue) => issue.message))];
  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  useEffect(() => {
    let active = true;
    void fetch("/api/settings")
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.data?.storage) setStorage(payload.data.storage);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    let restoringHistory = false;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    const guardLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      if (!window.confirm("设置尚未保存，确定离开此页面吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const guardHistory = () => {
      if (restoringHistory) {
        restoringHistory = false;
        return;
      }
      if (!window.confirm("设置尚未保存，确定离开此页面吗？")) {
        restoringHistory = true;
        window.history.forward();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", guardHistory);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", guardHistory);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);

  function update<K extends keyof RepositoryConfig>(
    key: K,
    value: RepositoryConfig[K],
  ) {
    editRevisionRef.current += 1;
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function updatePreset<K extends keyof PostPreset>(
    index: number,
    key: K,
    value: PostPreset[K],
  ) {
    editRevisionRef.current += 1;
    setConfig((current) => ({
      ...current,
      postPresets: current.postPresets.map((preset, presetIndex) =>
        presetIndex === index ? { ...preset, [key]: value } : preset,
      ),
    }));
  }

  function movePreset(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= config.postPresets.length) return;
    editRevisionRef.current += 1;
    setConfig((current) => {
      const next = [...current.postPresets];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, postPresets: next };
    });
  }

  function addPreset() {
    if (config.postPresets.length >= 8) return;
    editRevisionRef.current += 1;
    setConfig((current) => {
      return {
        ...current,
        postPresets: [
          ...current.postPresets,
          {
            id: `preset-${Date.now()}-${current.postPresets.length + 1}`,
            label: "新模板",
            slugTemplate: "post-{seq:02}",
            titleTemplate: "新文章-{seq:02}",
            tags: [],
            categories: [],
            layout: current.defaultLayout,
          },
        ],
      };
    });
  }

  function removePreset(index: number) {
    editRevisionRef.current += 1;
    setConfig((current) => ({
      ...current,
      postPresets: current.postPresets.filter(
        (_, presetIndex) => presetIndex !== index,
      ),
    }));
  }

  async function save() {
    if (!validation.success) {
      setMessage(validationErrors[0] || "请先修正配置错误。");
      return;
    }
    const submittedRevision = editRevisionRef.current;
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "设置保存失败。");
      }
      setSavedConfig(payload.data.config);
      setStorage(payload.data.storage);
      if (editRevisionRef.current === submittedRevision) {
        setConfig(payload.data.config);
        setMessage("设置已保存，仅对当前浏览器生效。");
        router.refresh();
      } else {
        setMessage("提交时的设置已保存；请求期间的新修改仍未保存。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "设置保存失败。");
    } finally {
      setBusy("");
    }
  }

  async function testConnection() {
    if (!validation.success) {
      setMessage(validationErrors[0] || "请先修正配置错误。");
      return;
    }
    setBusy("test");
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "连接校验失败。");
      }
      setMessage(payload.data.message || "仓库连接和路径配置有效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连接校验失败。");
    } finally {
      setBusy("");
    }
  }

  async function reset() {
    if (!window.confirm("将全部非敏感设置恢复为服务端默认值，是否继续？")) {
      return;
    }
    const submittedRevision = editRevisionRef.current;
    setBusy("reset");
    try {
      const response = await fetch("/api/settings", { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || "重置失败。");
      }
      setSavedConfig(payload.data.config);
      setStorage(payload.data.storage);
      if (editRevisionRef.current === submittedRevision) {
        setConfig(payload.data.config);
        setMessage("已恢复环境变量默认值。");
        router.refresh();
      } else {
        setMessage("环境变量默认值已恢复；请求期间的新修改仍未保存。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重置失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">仓库与 Hexo</h2>
          <span className={`badge${tokenConfigured ? " success" : " danger"}`}>
            <ShieldCheck size={13} />
            GitHub Token {tokenConfigured ? "已配置" : "未配置"}
          </span>
        </div>
        <div className="panel-body">
          <div className="alert" style={{ marginBottom: 20 }}>
            <ShieldCheck size={18} />
            <div>
              Token、OAuth Secret 和 AUTH_SECRET 只能通过服务端环境变量配置，
              不会显示或写入浏览器存储。下面的非敏感设置保存在签名 HttpOnly
              Cookie 中，仅对当前浏览器生效；换设备或清理 Cookie 后会恢复环境变量默认值。
            </div>
          </div>
          {repositoryScopeLocked ? (
            <div className="alert" style={{ marginBottom: 20 }}>
              <ShieldCheck size={18} />
              <div>
                GitHub 仓库、分支和三条内容路径由服务端环境变量锁定。
                这可防止浏览器设置借用服务器 Token 访问其他仓库；如需变更，请更新部署环境后重启。
              </div>
            </div>
          ) : null}
          {validationErrors.length ? (
            <div aria-live="polite" className="alert danger" style={{ marginBottom: 20 }}>
              <div>
                <strong>配置需要修正</strong>
                <div>{validationErrors[0]}</div>
              </div>
            </div>
          ) : null}
          <div className="form-grid">
            <label className="field">
              <span className="field-label">GitHub Owner</span>
              <input className="input" disabled={repositoryScopeLocked} onChange={(event) => update("owner", event.target.value)} value={config.owner} />
            </label>
            <label className="field">
              <span className="field-label">GitHub Repository</span>
              <input className="input" disabled={repositoryScopeLocked} onChange={(event) => update("repo", event.target.value)} value={config.repo} />
            </label>
            <label className="field">
              <span className="field-label">Branch</span>
              <input className="input" disabled={repositoryScopeLocked} onChange={(event) => update("branch", event.target.value)} value={config.branch} />
            </label>
            <label className="field">
              <span className="field-label">GitHub Actions Workflow</span>
              <input className="input" onChange={(event) => update("workflowId", event.target.value)} value={config.workflowId} />
            </label>
            <label className="field">
              <span className="field-label">Posts Path</span>
              <input className="input" disabled={repositoryScopeLocked} onChange={(event) => update("postsPath", event.target.value)} value={config.postsPath} />
            </label>
            <label className="field">
              <span className="field-label">Drafts Path</span>
              <input className="input" disabled={repositoryScopeLocked} onChange={(event) => update("draftsPath", event.target.value)} value={config.draftsPath} />
            </label>
            <label className="field">
              <span className="field-label">Images Path</span>
              <input className="input" disabled={repositoryScopeLocked} onChange={(event) => update("imagesPath", event.target.value)} value={config.imagesPath} />
            </label>
            <label className="field">
              <span className="field-label">Public Blog URL</span>
              <input className="input" onChange={(event) => update("publicBlogUrl", event.target.value)} type="url" value={config.publicBlogUrl} />
            </label>
            <label className="field">
              <span className="field-label">默认布局</span>
              <input className="input" onChange={(event) => update("defaultLayout", event.target.value)} value={config.defaultLayout} />
            </label>
            <label className="field">
              <span className="field-label">默认分类</span>
              <input className="input" onChange={(event) => update("defaultCategory", event.target.value)} value={config.defaultCategory} />
            </label>
            <label className="field span-2">
              <span className="field-label">默认 Commit Message 模板</span>
              <input className="input" onChange={(event) => update("commitTemplate", event.target.value)} value={config.commitTemplate} />
              <span className="field-help">
                可使用 {"{action}"} 和 {"{slug}"}。
              </span>
            </label>
            <label className="field span-2 settings-checkbox">
              <input checked={config.autoDispatch} onChange={(event) => update("autoDispatch", event.target.checked)} type="checkbox" />
              <span>
                内容提交后额外触发 workflow_dispatch
                <span className="field-help">deploy.yml 已监听 main push，通常保持关闭即可。</span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">编辑器与快捷模板</h2>
          <span className="badge">{config.postPresets.length} / 8</span>
        </div>
        <div className="panel-body">
          <label className="field" style={{ maxWidth: 360, marginBottom: 20 }}>
            <span className="field-label">新打开文章时的默认模式</span>
            <select
              className="select"
              onChange={(event) =>
                update(
                  "editorDefaultMode",
                  event.target.value as RepositoryConfig["editorDefaultMode"],
                )
              }
              value={config.editorDefaultMode}
            >
              <option value="live">Live Preview（所见即所得）</option>
              <option value="source">Markdown 源码</option>
            </select>
            <span className="field-help">浏览器会另外记住你最近一次手动切换的模式。</span>
          </label>

          <div className="preset-settings-list">
            {config.postPresets.map((preset, index) => (
              <div className="preset-settings-card" key={preset.id}>
                <div className="preset-settings-toolbar">
                  <strong>{preset.label || `模板 ${index + 1}`}</strong>
                  <div className="button-group">
                    <button aria-label={`上移模板：${preset.label || index + 1}`} className="icon-button" disabled={index === 0} onClick={() => movePreset(index, -1)} type="button"><ChevronUp size={15} /></button>
                    <button aria-label={`下移模板：${preset.label || index + 1}`} className="icon-button" disabled={index === config.postPresets.length - 1} onClick={() => movePreset(index, 1)} type="button"><ChevronDown size={15} /></button>
                    <button aria-label={`删除模板：${preset.label || index + 1}`} className="icon-button" onClick={() => removePreset(index)} type="button"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">按钮名称</span>
                    <input className="input" onChange={(event) => updatePreset(index, "label", event.target.value)} value={preset.label} />
                  </label>
                  <label className="field">
                    <span className="field-label">布局</span>
                    <input className="input" onChange={(event) => updatePreset(index, "layout", event.target.value)} value={preset.layout} />
                  </label>
                  <label className="field">
                    <span className="field-label">英文文件名模板</span>
                    <input className="input post-slug" onChange={(event) => updatePreset(index, "slugTemplate", event.target.value)} value={preset.slugTemplate} />
                  </label>
                  <label className="field">
                    <span className="field-label">中文标题模板</span>
                    <input className="input" onChange={(event) => updatePreset(index, "titleTemplate", event.target.value)} value={preset.titleTemplate} />
                  </label>
                  <label className="field">
                    <span className="field-label">默认标签（逗号分隔）</span>
                    <input className="input" onChange={(event) => updatePreset(index, "tags", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} value={preset.tags.join(", ")} />
                  </label>
                  <label className="field">
                    <span className="field-label">默认分类（每行一条，&gt; 分级）</span>
                    <textarea className="textarea" onChange={(event) => updatePreset(index, "categories", event.target.value.split(/\r?\n/).map((line) => line.split(">").map((item) => item.trim()).filter(Boolean)).filter((path) => path.length))} value={preset.categories.map((path) => path.join(" > ")).join("\n")} />
                  </label>
                </div>
                <p className="field-help">
                  支持 {"{seq:02}"}（补零序号）和 {"{date}"}（当天日期）。
                </p>
              </div>
            ))}
          </div>
          <button className="button" disabled={config.postPresets.length >= 8} onClick={addPreset} type="button">
            <Plus size={15} />
            新增模板
          </button>
        </div>
      </section>

      <div className="settings-savebar">
        <div className="settings-savecopy" aria-live="polite">
          <strong>{dirty ? "有未保存的更改" : "所有更改已保存"}</strong>
          <span>
            当前浏览器
            {storage
              ? ` · Cookie ${storage.bytes} / ${storage.maxBytes} 字节`
              : " · 正在读取存储用量…"}
          </span>
        </div>
        <div className="button-group">
          <button
            className="button"
            disabled={Boolean(busy) || !validation.success}
            onClick={testConnection}
            type="button"
          >
            {busy === "test" ? <CircleCheck size={15} /> : <Link2 size={15} />}
            {busy === "test" ? "正在校验…" : "校验连接与路径"}
          </button>
          <button className="button" disabled={Boolean(busy)} onClick={reset} type="button">
            <RotateCcw size={15} />
            {busy === "reset" ? "正在恢复…" : "恢复环境变量"}
          </button>
          <button
            className="button primary"
            disabled={Boolean(busy) || !dirty || !validation.success}
            onClick={save}
            type="button"
          >
            <Save size={15} />
            {busy === "save" ? "正在保存…" : "保存设置"}
          </button>
        </div>
      </div>
      {message ? <div aria-live="polite" className="toast">{message}</div> : null}
    </div>
  );
}
