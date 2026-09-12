// @vitest-environment jsdom
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetBrowserFallback } from "@/lib/browser-storage";
import { ThemeToggle } from "./theme-toggle";

let media: EventTarget & { matches: boolean };
beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  forgetBrowserFallback("local", "admin-theme");
  localStorage.clear();
});

describe("theme preference", () => {
  it("follows the system until a theme is explicitly chosen", () => {
    render(createElement(ThemeToggle));
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event("change"));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    act(() => media.dispatchEvent(new Event("change")));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("renders and toggles both ways when storage is blocked", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    render(createElement(ThemeToggle));
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("responds to another tab's change and removal of a preference", () => {
    render(createElement(ThemeToggle));
    act(() => {
      localStorage.setItem("admin-theme", "dark");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "admin-theme",
          storageArea: localStorage,
        }),
      );
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => {
      localStorage.clear();
      window.dispatchEvent(
        new StorageEvent("storage", { key: null, storageArea: localStorage }),
      );
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
