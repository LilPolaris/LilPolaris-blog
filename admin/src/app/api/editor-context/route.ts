import { requireAdminApi } from "@/lib/auth-guard";
import { buildEditorContext } from "@/lib/editor-context";
import { errorResponse } from "@/lib/errors";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";

export async function GET() {
  try {
    await requireAdminApi();
    const [repository, config] = await Promise.all([
      getRepository(),
      getEffectiveRepositoryConfig(),
    ]);
    const posts = await repository.listPosts();
    return Response.json({ data: buildEditorContext(posts, config) });
  } catch (error) {
    return errorResponse(error);
  }
}
