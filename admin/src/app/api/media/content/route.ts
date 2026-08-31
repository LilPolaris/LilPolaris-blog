import { requireAdminApi } from "@/lib/auth-guard";
import { AppError, errorResponse } from "@/lib/errors";
import { beginApiRequest, logApiEvent } from "@/lib/observability";
import { getRepository } from "@/lib/repository";

export async function GET(request: Request) {
  const context = beginApiRequest(request, "media.content");
  try {
    await requireAdminApi();
    const searchParams = new URL(request.url).searchParams;
    const path = searchParams.get("path");
    const sha = searchParams.get("sha") || undefined;
    if (!path) throw new AppError("VALIDATION", "缺少媒体路径。", 400);
    const repository = await getRepository();
    const media = await repository.getMedia(path, sha);
    logApiEvent(context, "api.request.succeeded", {
      size: media.bytes.byteLength,
    });
    return new Response(media.bytes as BodyInit, {
      headers: {
        "content-type": media.contentType,
        etag: media.etag,
        "cache-control": sha
          ? "private, max-age=31536000, immutable"
          : "private, max-age=3600",
        "x-content-type-options": "nosniff",
        "x-request-id": context.requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, context);
  }
}
