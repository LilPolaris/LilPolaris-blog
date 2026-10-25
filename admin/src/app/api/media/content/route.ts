import sharp from "sharp";
import { requireAdminApi } from "@/lib/auth-guard";
import { AppError, errorResponse } from "@/lib/errors";
import { beginApiRequest, logApiEvent } from "@/lib/observability";
import { RESIZABLE_IMAGE_TYPES, thumbnailWidth } from "@/lib/media-thumbnail";
import { getRepository } from "@/lib/repository";

export async function GET(request: Request) {
  const context = beginApiRequest(request, "media.content");
  try {
    await requireAdminApi();
    const searchParams = new URL(request.url).searchParams;
    const path = searchParams.get("path");
    const sha = searchParams.get("sha") || undefined;
    const width = thumbnailWidth(searchParams.get("w"));
    if (!path) throw new AppError("VALIDATION", "缺少媒体路径。", 400);
    const repository = await getRepository();
    const media = await repository.getMedia(path, sha);
    let bytes: Uint8Array = media.bytes;
    let contentType = media.contentType;
    if (width && RESIZABLE_IMAGE_TYPES.has(contentType)) {
      // Library grids only need small previews; shrinking them on the server
      // keeps a page of thumbnails to a few hundred kilobytes.
      bytes = new Uint8Array(
        await sharp(media.bytes, { failOn: "none" })
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 72 })
          .toBuffer(),
      );
      contentType = "image/webp";
    }
    logApiEvent(context, "api.request.succeeded", {
      size: bytes.byteLength,
      thumbnail: Boolean(width),
    });
    return new Response(bytes as BodyInit, {
      headers: {
        "content-type": contentType,
        etag: width ? `${media.etag}-w${width}` : media.etag,
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
