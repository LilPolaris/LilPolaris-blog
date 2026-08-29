import { requireAdminApi } from "@/lib/auth-guard";
import { errorResponse } from "@/lib/errors";
import { getRepository } from "@/lib/repository";
import { taxonomySchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    const input = taxonomySchema.parse(await request.json());
    const repository = await getRepository();
    return Response.json({
      data: await repository.renameTaxonomy(input),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
