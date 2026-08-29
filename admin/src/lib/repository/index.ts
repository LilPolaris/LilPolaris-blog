import { requireGitHubToken } from "@/lib/config";
import { GitHubRepositoryAdapter } from "@/lib/repository/github";
import { MockRepositoryAdapter } from "@/lib/repository/mock";
import type { RepositoryAdapter } from "@/lib/repository/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";

let mockRepository: MockRepositoryAdapter | undefined;

export async function getRepository(): Promise<RepositoryAdapter> {
  const config = await getEffectiveRepositoryConfig();
  if (config.adapter === "mock") {
    mockRepository ??= new MockRepositoryAdapter(config);
    return mockRepository;
  }
  return new GitHubRepositoryAdapter(config, requireGitHubToken());
}
