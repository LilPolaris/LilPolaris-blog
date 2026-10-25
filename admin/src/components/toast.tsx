"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

const PROBLEM_PATTERN = /失败|错误|无法|超时|冲突|不能|不完整|请先|请尽快/;

export function isProblemMessage(message: string) {
  return PROBLEM_PATTERN.test(message);
}

/**
 * Bottom-right notice shared by the admin pages. Routine confirmations fade
 * after a few seconds; anything that reads like a problem stays until closed
 * so it cannot disappear before it was read.
 */
export function Toast({
  message,
  onDismiss,
  duration = 5_000,
}: {
  message: string;
  onDismiss: () => void;
  duration?: number;
}) {
  const sticky = isProblemMessage(message);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!message || sticky) return;
    const timer = window.setTimeout(() => dismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [duration, message, sticky]);

  if (!message) return null;
  return (
    <div
      aria-live="polite"
      className={`toast${sticky ? " problem" : ""}`}
      role={sticky ? "alert" : "status"}
    >
      <span>{message}</span>
      <button
        aria-label="关闭提示"
        className="toast-close"
        onClick={onDismiss}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}
