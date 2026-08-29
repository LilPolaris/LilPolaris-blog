"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="panel error-state">
      <span className="empty-icon">
        <AlertTriangle size={22} />
      </span>
      <h1 className="empty-title">无法加载当前页面</h1>
      <p className="empty-description">
        {error.message || "GitHub 请求失败，请检查连接和权限后重试。"}
      </p>
      <button className="button" onClick={reset} type="button">
        <RotateCcw size={15} />
        重新加载
      </button>
    </div>
  );
}
