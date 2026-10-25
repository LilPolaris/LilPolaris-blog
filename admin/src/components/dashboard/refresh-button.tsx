"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton({ label = "刷新" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      title="重新读取 GitHub 数据"
      type="button"
    >
      <RefreshCw className={pending ? "spin" : ""} size={15} />
      {pending ? "读取中…" : label}
    </button>
  );
}
