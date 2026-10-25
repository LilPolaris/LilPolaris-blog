import { formatBlogTimestamp } from "@/lib/blog-time";
import { isDeploymentAttempt } from "@/lib/format";
import type {
  DashboardData,
  MediaAsset,
  MutationResult,
  PostBundleMutationInput,
  PostBundleMutationResult,
  PostDocument,
  PostKind,
  PostMutationInput,
  PostSummary,
  RenameTaxonomyInput,
  StagePostMediaInput,
  StagedPostMedia,
  TaxonomyMutationResult,
  WorkflowRun,
} from "@/lib/types";

export interface RepositoryAdapter {
  checkConnection(): Promise<boolean>;
  listPosts(kind?: PostKind): Promise<PostSummary[]>;
  getPost(path: string): Promise<PostDocument>;
  savePost(input: PostMutationInput): Promise<MutationResult>;
  stagePostMedia(input: StagePostMediaInput): Promise<StagedPostMedia>;
  savePostBundle(
    input: PostBundleMutationInput,
  ): Promise<PostBundleMutationResult>;
  deletePost(
    path: string,
    expectedSha: string,
    deleteAssets: boolean,
  ): Promise<MutationResult>;
  duplicatePost(
    path: string,
    expectedSha: string,
    targetSlug: string,
  ): Promise<MutationResult>;
  listMedia(): Promise<MediaAsset[]>;
  getMedia(path: string, sha?: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
    etag: string;
  }>;
  uploadMedia(input: {
    bytes: Uint8Array;
    name: string;
    contentType: string;
    postPath?: string;
  }): Promise<MediaAsset>;
  deleteMedia(path: string, expectedSha: string): Promise<MutationResult>;
  listWorkflowRuns(): Promise<WorkflowRun[]>;
  dispatchWorkflow(): Promise<void>;
  renameTaxonomy(
    input: RenameTaxonomyInput,
  ): Promise<TaxonomyMutationResult>;
}

export async function getDashboardData(
  repository: RepositoryAdapter,
  { timezone = "Asia/Shanghai", now = new Date() } = {},
): Promise<DashboardData> {
  const [postResult, connectionResult, workflowResult] =
    await Promise.allSettled([
      repository.listPosts(),
      repository.checkConnection(),
      repository.listWorkflowRuns(),
    ]);
  const allPosts = postResult.status === "fulfilled" ? postResult.value : [];
  const posts = allPosts.filter((post) => post.kind === "post");
  const drafts = allPosts.filter((post) => post.kind === "draft");
  const connected =
    connectionResult.status === "fulfilled" && connectionResult.value;
  const runs =
    workflowResult.status === "fulfilled" ? workflowResult.value : [];
  const updated = [...posts, ...drafts].sort((a, b) =>
    b.updated.localeCompare(a.updated),
  );
  const published = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const recentDrafts = [...drafts]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 3);
  const errorMessage = (
    result: PromiseSettledResult<unknown>,
    fallback: string,
  ) =>
    result.status === "rejected" && result.reason instanceof Error
      ? result.reason.message
      : fallback;
  return {
    totalPosts: posts.length,
    totalDrafts: drafts.length,
    recentUpdated: updated.slice(0, 5),
    recentPublished: published.slice(0, 5),
    recentDrafts,
    // Hexo timestamps share one fixed-width format, so a string comparison
    // against the cutoff in the blog timezone is an exact date comparison.
    updatedLast30Days: (() => {
      const cutoff = formatBlogTimestamp(
        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        timezone,
      );
      return allPosts.filter((post) => post.updated >= cutoff).length;
    })(),
    latestPublishedAt: published[0]?.date || null,
    repositoryConnected: connected,
    lastSyncAt: new Date().toISOString(),
    // Skipped runs (guestbook comments) never deployed anything; showing one
    // would hide the state of the last real deployment.
    latestRun: runs.find(isDeploymentAttempt) || null,
    sourceStatus: {
      posts: postResult.status === "fulfilled" ? "ok" : "error",
      connection: connected ? "ok" : "error",
      workflow: workflowResult.status === "fulfilled" ? "ok" : "error",
    },
    sourceErrors: {
      ...(postResult.status === "rejected"
        ? { posts: errorMessage(postResult, "文章列表读取失败。") }
        : {}),
      ...(!connected
        ? {
            connection: errorMessage(
              connectionResult,
              "GitHub 仓库连接检查失败。",
            ),
          }
        : {}),
      ...(workflowResult.status === "rejected"
        ? {
            workflow: errorMessage(
              workflowResult,
              "部署工作流状态读取失败。",
            ),
          }
        : {}),
    },
  };
}
