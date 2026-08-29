import { z } from "zod";
import { generateAiMetadata } from "@/lib/ai-metadata";
import {
  getAiMetadataStatus,
  supportsBrowserStoredAiKey,
} from "@/lib/ai-config";
import {
  clearStoredAiApiKey,
  saveStoredAiApiKey,
} from "@/lib/ai-secret";
import { requireAdminApi } from "@/lib/auth-guard";
import { getAiMetadataConfig } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import { requireSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";

const apiKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(10, "API Key 看起来太短，请检查后重试。")
    .max(500, "API Key 长度异常，请检查后重试。"),
});

export async function GET() {
  try {
    await requireAdminApi();
    return Response.json({ data: { status: await getAiMetadataStatus() } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    requireSameOriginRequest(request, {
      json: true,
      maxContentLengthBytes: 8 * 1024,
    });
    const { apiKey } = apiKeySchema.parse(await request.json());
    const config = { ...getAiMetadataConfig(), apiKey };
    if (!supportsBrowserStoredAiKey(config)) {
      throw new AppError(
        "VALIDATION",
        "设置页粘贴的 Key 只会发送到官方 https://api.deepseek.com；自定义模型地址请使用服务端环境变量。",
        400,
      );
    }
    await generateAiMetadata(
      config,
      {
        title: "API 连接测试",
        content: "仅用于确认模型可以返回结构化的英文文件名、标签和分类。",
      },
      [],
    );
    await saveStoredAiApiKey(apiKey);
    return Response.json({
      data: {
        status: await getAiMetadataStatus(),
        message: `${config.model} 连接成功，API Key 已加密保存。`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminApi();
    requireSameOriginRequest(request);
    await clearStoredAiApiKey();
    return Response.json({
      data: {
        status: await getAiMetadataStatus(),
        message: "当前浏览器保存的 AI API Key 已删除。",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
