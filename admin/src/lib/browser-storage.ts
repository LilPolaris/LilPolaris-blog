type StorageKind = "local" | "session";

// Only transient UI preferences/messages belong here, never article recovery or
// credentials. Failed writes stay usable for the lifetime of this page.
const fallback = {
  local: new Map<string, string | null>(),
  session: new Map<string, string | null>(),
};

export function readBrowserValue(
  kind: StorageKind,
  key: string,
): string | null {
  if (typeof window === "undefined") return null;
  if (fallback[kind].has(key)) return fallback[kind].get(key) ?? null;
  try {
    return window[kind === "local" ? "localStorage" : "sessionStorage"].getItem(
      key,
    );
  } catch {
    return null;
  }
}

export function writeBrowserValue(
  kind: StorageKind,
  key: string,
  value: string | null,
) {
  if (typeof window === "undefined") return;
  try {
    const storage =
      window[kind === "local" ? "localStorage" : "sessionStorage"];
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    fallback[kind].delete(key);
  } catch {
    fallback[kind].set(key, value);
  }
}

export function forgetBrowserFallback(kind: StorageKind, key: string) {
  fallback[kind].delete(key);
}
