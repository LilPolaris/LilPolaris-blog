import { describe, expect, it } from "vitest";
import { healthResponse } from "@/app/api/health/route";

describe("deployment health route", () => {
  it("returns 200 without exposing secrets when configuration is complete", async () => {
    const response = healthResponse(
      {
        configured: true,
        missing: [],
        authConfigured: true,
        repositoryConfigured: true,
      },
      "preview",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "healthy",
      service: "lilpolaris-blog-admin",
      deploymentEnvironment: "preview",
      authConfigured: true,
      repositoryConfigured: true,
      missing: [],
    });
  });

  it("returns 503 with only missing variable names", async () => {
    const response = healthResponse(
      {
        configured: false,
        missing: ["AUTH_GITHUB_ID", "GITHUB_TOKEN"],
        authConfigured: false,
        repositoryConfigured: false,
      },
      "production",
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      deploymentEnvironment: "production",
      missing: ["AUTH_GITHUB_ID", "GITHUB_TOKEN"],
    });
  });
});
