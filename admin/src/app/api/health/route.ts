import { configurationStatus } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0",
} as const;

type HealthStatus = ReturnType<typeof configurationStatus>;

export function healthResponse(
  config: HealthStatus,
  deploymentEnvironment =
    process.env.VERCEL_ENV || process.env.VERCEL_TARGET_ENV || "local",
) {
  return Response.json(
    {
      status: config.configured ? "healthy" : "degraded",
      service: "lilpolaris-blog-admin",
      deploymentEnvironment,
      authConfigured: config.authConfigured,
      repositoryConfigured: config.repositoryConfigured,
      missing: config.missing,
    },
    {
      status: config.configured ? 200 : 503,
      headers: NO_STORE_HEADERS,
    },
  );
}

export async function GET() {
  return healthResponse(configurationStatus());
}
