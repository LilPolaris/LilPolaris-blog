"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("admin-theme-change", callback);
  return () => window.removeEventListener("admin-theme-change", callback);
}

function getThemeSnapshot() {
  const stored = localStorage.getItem("admin-theme");
  return (
    stored === "dark" ||
    (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getThemeSnapshot, () => false);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("admin-theme", next ? "dark" : "light");
    window.dispatchEvent(new Event("admin-theme-change"));
  }

  return (
    <button
      aria-label={dark ? "切换到亮色主题" : "切换到暗色主题"}
      className="icon-button ghost"
      onClick={toggle}
      type="button"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
