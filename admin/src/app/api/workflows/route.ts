import { requireAdminApi } from "@/lib/auth-guard";
import { errorResponse } from "@/lib/errors";
import { getRepository } from "@/lib/repository";

export async function GET() {
  try {
    await requireAdminApi();
    const repository = await getRepository();
    return Response.json({ data: await repository.listWorkflowRuns() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    await requireAdminApi();
    const repository = await getRepository();
    await repository.dispatchWorkflow();
    return Response.json({ data: { dispatched: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
