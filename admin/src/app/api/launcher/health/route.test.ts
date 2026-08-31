import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const ENVIRONMENT_KEYS = [
  "LILPOLARIS_LAUNCHER",
  "LILPOLARIS_LAUNCHER_INSTANCE_ID",
  "LILPOLARIS_LAUNCHER_BUILD_FINGERPRINT",
  "LILPOLARIS_LAUNCHER_BUILD_ID",
] as const;

const originalEnvironment = new Map(
  ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
);

function clearLauncherEnvironment() {
  for (const key of ENVIRONMENT_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of ENVIRONMENT_KEYS) {
    const value = originalEnvironment.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("launcher health route", () => {
  it("returns 404 outside a launcher-managed process", async () => {
    clearLauncherEnvironment();

    const response = await GET();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns the exact launcher identity when all runtime values are present", async () => {
    process.env.LILPOLARIS_LAUNCHER = "1";
    process.env.LILPOLARIS_LAUNCHER_INSTANCE_ID = "instance-123";
    process.env.LILPOLARIS_LAUNCHER_BUILD_FINGERPRINT = "fingerprint-456";
    process.env.LILPOLARIS_LAUNCHER_BUILD_ID = "build-789";

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "healthy",
      instanceId: "instance-123",
      buildFingerprint: "fingerprint-456",
      buildId: "build-789",
    });
  });

  it("returns 404 when the launcher marker exists but identity is incomplete", async () => {
    clearLauncherEnvironment();
    process.env.LILPOLARIS_LAUNCHER = "1";
    process.env.LILPOLARIS_LAUNCHER_INSTANCE_ID = "instance-123";

    const response = await GET();

    expect(response.status).toBe(404);
  });
});
