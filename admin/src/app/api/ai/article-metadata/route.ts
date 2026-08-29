import { aiMetadataRequestSchema, generateAiMetadata } from "@/lib/ai-metadata";
import { getEffectiveAiMetadataConfig } from "@/lib/ai-config";
import { requireAdminApi } from "@/lib/auth-guard";
import { AppError, errorResponse } from "@/lib/errors";
import { getRepository } from "@/lib/repository";
import { requireSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    requireSameOriginRequest(request, {
      json: true,
      maxContentLengthBytes: 256 * 1024,
    });
    const input = aiMetadataRequestSchema.parse(await request.json());
    const config = await getEffectiveAiMetadataConfig();
    if (config.provider === "deepseek" && !config.apiKey) {
      throw new AppError(
        "CONFIG_MISSING",
        "尚未配置 DeepSeek API Key；请到“设置”页面粘贴并保存。",
        503,
        { missing: ["AI_API_KEY"] },
      );
    }
    const repository = await getRepository();
    const suggestion = await generateAiMetadata(
      config,
      input,
      await repository.listPosts(),
    );
    return Response.json({
      data: suggestion,
      provider: config.provider,
      model: config.model,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
