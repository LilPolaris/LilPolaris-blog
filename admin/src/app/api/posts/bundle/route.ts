import { requireAdminApi } from "@/lib/auth-guard";
import { AppError, errorResponse } from "@/lib/errors";
import {
  beginApiRequest,
  jsonWithRequestId,
  logApiEvent,
} from "@/lib/observability";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";
import {
  stagedMediaSigningSecret,
  verifyStagedMediaReceipts,
} from "@/lib/staged-media";
import { postBundleRequestSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = beginApiRequest(request, "post.bundle.save");
  try {
    await requireAdminApi();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("VALIDATION", "请求正文必须是有效的 JSON。", 400);
    }
    const input = postBundleRequestSchema.parse(body);
    const config = await getEffectiveRepositoryConfig();
    const media = verifyStagedMediaReceipts(
      input.mediaReceipts,
      {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
      },
      stagedMediaSigningSecret(),
    );
    const repository = await getRepository();
    const result = await repository.savePostBundle({ ...input.post, media });
    let deploymentWarning: string | undefined;
    if (config.autoDispatch) {
      try {
        await repository.dispatchWorkflow();
      } catch {
        deploymentWarning = "内容已保存，但额外触发部署失败，请到部署记录重试。";
      }
    }
    logApiEvent(context, "api.request.succeeded", {
      kind: input.post.kind,
      mediaCount: media.length,
      mediaBytes: media.reduce((sum, item) => sum + item.size, 0),
    });
    return jsonWithRequestId(
      context,
      { data: result, warning: deploymentWarning },
      { status: input.post.currentPath ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error, context);
  }
}
