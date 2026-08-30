export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

export async function GET() {
  const instanceId = process.env.LILPOLARIS_LAUNCHER_INSTANCE_ID;
  const buildFingerprint = process.env.LILPOLARIS_LAUNCHER_BUILD_FINGERPRINT;
  const buildId = process.env.LILPOLARIS_LAUNCHER_BUILD_ID;

  if (
    process.env.LILPOLARIS_LAUNCHER !== "1" ||
    !instanceId ||
    !buildFingerprint ||
    !buildId
  ) {
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    {
      status: "healthy",
      instanceId,
      buildFingerprint,
      buildId,
    },
    { headers: NO_STORE_HEADERS },
  );
}
