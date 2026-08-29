import { PageHeader } from "@/components/page-header";
import { Deployments } from "@/components/deployments/deployments";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";

export const metadata = { title: "部署记录" };

export default async function DeploymentsPage() {
  const [repository, config] = await Promise.all([
    getRepository(),
    getEffectiveRepositoryConfig(),
  ]);
  const runs = await repository.listWorkflowRuns();
  return (
    <>
      <PageHeader
        description="读取真实 GitHub Actions 状态；不会伪造部署结果。"
        title="部署记录"
      />
      <Deployments
        publicBlogUrl={config.publicBlogUrl}
        runs={runs}
        workflowId={config.workflowId}
      />
    </>
  );
}
