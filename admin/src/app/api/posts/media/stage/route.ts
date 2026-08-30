import { requireAdminApi } from "@/lib/auth-guard";
import { AppError, errorResponse } from "@/lib/errors";
import { prepareOrReuseMediaFileName } from "@/lib/media-name";
import {
  beginApiRequest,
  jsonWithRequestId,
  logApiEvent,
} from "@/lib/observability";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";
import {
  createStagedMediaReceipt,
  stagedMediaSigningSecret,
} from "@/lib/staged-media";
import { stageMediaMetadataSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = beginApiRequest(request, "post.media.stage");
  try {
    await requireAdminApi();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("UPLOAD_INVALID", "请选择要暂存的图片。", 400);
    }
    const metadata = stageMediaMetadataSchema.parse({
      id: form.get("id"),
      referenceName: form.get("referenceName"),
      originalName: form.get("originalName"),
    });
    const preparedName = prepareOrReuseMediaFileName({
      originalName: metadata.originalName,
      uploadedFileName: file.name,
      contentType: file.type,
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const config = await getEffectiveRepositoryConfig();
    const secret = stagedMediaSigningSecret();
    const repository = await getRepository();
    const staged = await repository.stagePostMedia({
      id: metadata.id,
      referenceName: metadata.referenceName,
      preparedName,
      contentType: file.type,
      bytes,
    });
    const receipt = createStagedMediaReceipt(
      staged,
      {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
      },
      secret,
    );
    logApiEvent(context, "api.request.succeeded", {
      contentType: staged.contentType,
      size: staged.size,
    });
    return jsonWithRequestId(
      context,
      {
        id: staged.id,
        preparedName: staged.preparedName,
        contentType: staged.contentType,
        size: staged.size,
        receipt,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, context);
  }
}
