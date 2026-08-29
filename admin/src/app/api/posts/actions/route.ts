import { requireAdminApi } from "@/lib/auth-guard";
import { errorResponse } from "@/lib/errors";
import { getRepository } from "@/lib/repository";
import { duplicateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    const input = duplicateSchema.parse(await request.json());
    const repository = await getRepository();
    const result = await repository.duplicatePost(
      input.path,
      input.expectedSha,
      input.targetSlug,
    );
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
