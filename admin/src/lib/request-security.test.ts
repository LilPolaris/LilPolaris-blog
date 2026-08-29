import { describe, expect, it } from "vitest";
import { requireSameOriginRequest } from "@/lib/request-security";

function request(headers: Record<string, string>) {
  return new Request("https://admin.example.com/api/ai/settings", {
    method: "POST",
    headers,
  });
}

describe("same-origin mutation guard", () => {
  it("accepts same-origin JSON requests", () => {
    expect(() =>
      requireSameOriginRequest(
        request({
          origin: "https://admin.example.com",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json; charset=utf-8",
        }),
        { json: true },
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOriginRequest(
        request({
          referer: "https://admin.example.com/settings",
          "content-type": "application/json",
        }),
        { json: true },
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOriginRequest(
        request({
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        }),
        { json: true },
      ),
    ).not.toThrow();
  });

  it("rejects sibling origins, missing origins, and simple text posts", () => {
    expect(() =>
      requireSameOriginRequest(
        request({
          origin: "https://evil.example.com",
          "sec-fetch-site": "same-site",
          "content-type": "text/plain",
        }),
        { json: true },
      ),
    ).toThrowError(/当前后台页面/);
    expect(() =>
      requireSameOriginRequest(
        request({ "content-type": "application/json" }),
        { json: true },
      ),
    ).toThrowError(/当前后台页面/);
    expect(() =>
      requireSameOriginRequest(
        request({
          origin: "https://admin.example.com",
          "sec-fetch-site": "same-origin",
          "content-type": "text/plain",
        }),
        { json: true },
      ),
    ).toThrowError(/application\/json/);
  });

  it("rejects oversized JSON before reading the request body", () => {
    expect(() =>
      requireSameOriginRequest(
        request({
          origin: "https://admin.example.com",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          "content-length": "9000",
        }),
        { json: true, maxContentLengthBytes: 8192 },
      ),
    ).toThrowError(/内容过大/);
  });
});
