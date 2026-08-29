import { requireAdminApi } from "@/lib/auth-guard";
import { errorResponse } from "@/lib/errors";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";
import { postMutationSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await requireAdminApi();
    const kind = new URL(request.url).searchParams.get("kind");
    const repository = await getRepository();
    const posts = await repository.listPosts(
      kind === "post" || kind === "draft" ? kind : undefined,
    );
    return Response.json({ data: posts });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    const input = postMutationSchema.parse(await request.json());
    const repository = await getRepository();
    const result = await repository.savePost(input);
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
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
