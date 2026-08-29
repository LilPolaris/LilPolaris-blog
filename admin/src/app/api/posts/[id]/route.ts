import { requireAdminApi } from "@/lib/auth-guard";
import { errorResponse } from "@/lib/errors";
import { decodePostId } from "@/lib/path";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";
import { postMutationSchema } from "@/lib/validation";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdminApi();
    const { id } = await context.params;
    const repository = await getRepository();
    return Response.json({ data: await repository.getPost(decodePostId(id)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdminApi();
    const { id } = await context.params;
    const input = postMutationSchema.parse(await request.json());
    const repository = await getRepository();
    const result = await repository.savePost({
      ...input,
      currentPath: decodePostId(id),
    });
    const config = await getEffectiveRepositoryConfig();
    let deploymentWarning: string | undefined;
    if (config.autoDispatch) {
      try {
        await repository.dispatchWorkflow();
      } catch {
        deploymentWarning = "内容已保存，但额外触发部署失败，请到部署记录重试。";
      }
    }
    return Response.json({ data: result, warning: deploymentWarning });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdminApi();
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const expectedSha = params.get("sha");
    if (!expectedSha) throw new Error("Missing sha");
    const repository = await getRepository();
    const result = await repository.deletePost(
      decodePostId(id),
      expectedSha,
      params.get("deleteAssets") === "true",
    );
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
