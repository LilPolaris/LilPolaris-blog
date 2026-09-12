"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import {
  forgetBrowserFallback,
  readBrowserValue,
  writeBrowserValue,
} from "@/lib/browser-storage";

const THEME_KEY = "admin-theme";

function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    forgetBrowserFallback("local", THEME_KEY);
    callback();
  };
  window.addEventListener("admin-theme-change", callback);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("admin-theme-change", callback);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", callback);
  };
}

function getThemeSnapshot() {
  const stored = readBrowserValue("local", THEME_KEY);
  return (
    stored === "dark" ||
    (stored !== "light" &&
      stored !== "dark" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
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
    writeBrowserValue("local", THEME_KEY, next ? "dark" : "light");
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
