import { requireGitHubToken } from "@/lib/config";
import { GitHubRepositoryAdapter } from "@/lib/repository/github";
import { MockRepositoryAdapter } from "@/lib/repository/mock";
import type { RepositoryAdapter } from "@/lib/repository/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";

const processRepositoryState = process as NodeJS.Process & {
  __lilpolarisMockRepository?: MockRepositoryAdapter;
};

export async function getRepository(): Promise<RepositoryAdapter> {
  const config = await getEffectiveRepositoryConfig();
  if (config.adapter === "mock") {
    // Route handlers can be emitted into separate VM contexts. The Node
    // process object is shared by those contexts in the local standalone
    // server, so one in-memory mock remains visible to every route.
    processRepositoryState.__lilpolarisMockRepository ??=
      new MockRepositoryAdapter(config);
    return processRepositoryState.__lilpolarisMockRepository;
  }
  return new GitHubRepositoryAdapter(config, requireGitHubToken());
}
