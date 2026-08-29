import { requireAdminApi } from "@/lib/auth-guard";
import { AppError, errorResponse } from "@/lib/errors";
import { normalizeImageBytes } from "@/lib/image-upload";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";
import { bundleManifestSchema, postMutationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    const form = await request.formData();
    const payloadValue = form.get("payload");
    const manifestValue = form.get("manifest");
    if (typeof payloadValue !== "string" || typeof manifestValue !== "string") {
      throw new AppError(
        "VALIDATION",
        "缺少文章数据或图片清单。",
        400,
      );
    }
    const input = postMutationSchema.parse(JSON.parse(payloadValue));
    const manifest = bundleManifestSchema.parse(JSON.parse(manifestValue));
    const seen = new Set<string>();
    const media = await Promise.all(
      manifest.map(async (entry) => {
        if (seen.has(entry.id)) {
          throw new AppError("VALIDATION", "图片清单包含重复项目。", 400);
        }
        seen.add(entry.id);
        const value = form.get(`media:${entry.id}`);
        if (!(value instanceof File)) {
          throw new AppError(
            "VALIDATION",
            `缺少待上传图片 ${entry.name}。`,
            400,
          );
        }
        if (value.type && value.type !== entry.contentType) {
          throw new AppError(
            "UPLOAD_INVALID",
            `图片 ${entry.name} 的 MIME 类型不一致。`,
            400,
          );
        }
        const bytes = new Uint8Array(await value.arrayBuffer());
        return {
          ...entry,
          bytes: await normalizeImageBytes(bytes, entry.contentType),
        };
      }),
    );
    const repository = await getRepository();
    const result = await repository.savePostBundle({ ...input, media });
    const config = await getEffectiveRepositoryConfig();
    let deploymentWarning: string | undefined;
    if (config.autoDispatch) {
      try {
        await repository.dispatchWorkflow();
      } catch {
        deploymentWarning = "内容已保存，但额外触发部署失败，请到部署记录重试。";
      }
    }
    return Response.json(
      { data: result, warning: deploymentWarning },
      { status: input.currentPath ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
