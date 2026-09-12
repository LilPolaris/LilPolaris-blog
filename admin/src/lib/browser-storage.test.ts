// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forgetBrowserFallback,
  readBrowserValue,
  writeBrowserValue,
} from "./browser-storage";

afterEach(() => {
  vi.restoreAllMocks();
  for (const kind of ["local", "session"] as const)
    forgetBrowserFallback(kind, "test");
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("browser UI storage", () => {
  it.each(["local", "session"] as const)(
    "keeps %s preferences usable when even accessing storage throws",
    (kind) => {
      vi.spyOn(
        window,
        kind === "local" ? "localStorage" : "sessionStorage",
        "get",
      ).mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });
      expect(readBrowserValue(kind, "test")).toBeNull();
      writeBrowserValue(kind, "test", "source");
      expect(readBrowserValue(kind, "test")).toBe("source");
      writeBrowserValue(kind, "test", null);
      expect(readBrowserValue(kind, "test")).toBeNull();
    },
  );

  it("uses the new preference when quota exhaustion leaves a stale stored value", () => {
    localStorage.setItem("test", "light");
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    writeBrowserValue("local", "test", "dark");
    expect(readBrowserValue("local", "test")).toBe("dark");
    spy.mockRestore();
    writeBrowserValue("local", "test", "light");
    expect(localStorage.getItem("test")).toBe("light");
    expect(readBrowserValue("local", "test")).toBe("light");
  });
});
