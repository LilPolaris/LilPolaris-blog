import { AppError } from "@/lib/errors";
import type { RepositoryAdapter } from "@/lib/repository/repository";

export interface RepositoryWriteGuardOptions {
  branch: string;
  authMode: "oauth" | "local-cli";
  contentWritePolicy?: string;
  vercel?: string;
  vercelEnv?: string;
  vercelTargetEnv?: string;
}

type WriteBlockReason =
  | "preview-main-protected"
  | "preview-workflow-protected"
  | "production-main-policy-required";

function normalized(value?: string) {
  return value?.trim().toLowerCase() || "";
}

function writeBlockedError(branch: string, reason: WriteBlockReason) {
  const message =
    reason === "preview-main-protected"
      ? "Vercel Preview 禁止向 main 分支写入，请使用专用 Preview 分支。"
      : reason === "preview-workflow-protected"
        ? "Vercel Preview 禁止触发部署工作流。"
      : "当前环境禁止向 main 分支写入；生产环境必须显式启用 production-main 写入策略。";
  return new AppError("FORBIDDEN", message, 403, { branch, reason });
}

export function assertRepositoryWriteAllowed(
  options: RepositoryWriteGuardOptions,
  operation: "content" | "dispatchWorkflow" = "content",
) {
  const branch = options.branch.trim();
  const isPreview = [options.vercelEnv, options.vercelTargetEnv].some(
    (value) => normalized(value) === "preview",
  );
  if (isPreview && operation === "dispatchWorkflow") {
    throw writeBlockedError(branch, "preview-workflow-protected");
  }
  if (normalized(branch) !== "main") return;
  if (isPreview) {
    throw writeBlockedError(branch, "preview-main-protected");
  }

  const isVercel =
    normalized(options.vercel) === "1" ||
    Boolean(normalized(options.vercelEnv)) ||
    Boolean(normalized(options.vercelTargetEnv));
  if (options.authMode === "local-cli" && !isVercel) return;
  if (options.contentWritePolicy === "production-main") return;

  throw writeBlockedError(branch, "production-main-policy-required");
}

class WriteGuardedRepositoryAdapter implements RepositoryAdapter {
  constructor(
    private readonly delegate: RepositoryAdapter,
    private readonly options: RepositoryWriteGuardOptions,
  ) {}

  checkConnection(...args: Parameters<RepositoryAdapter["checkConnection"]>) {
    return this.delegate.checkConnection(...args);
  }

  listPosts(...args: Parameters<RepositoryAdapter["listPosts"]>) {
    return this.delegate.listPosts(...args);
  }

  getPost(...args: Parameters<RepositoryAdapter["getPost"]>) {
    return this.delegate.getPost(...args);
  }

  listMedia(...args: Parameters<RepositoryAdapter["listMedia"]>) {
    return this.delegate.listMedia(...args);
  }

  getMedia(...args: Parameters<RepositoryAdapter["getMedia"]>) {
    return this.delegate.getMedia(...args);
  }

  listWorkflowRuns(
    ...args: Parameters<RepositoryAdapter["listWorkflowRuns"]>
  ) {
    return this.delegate.listWorkflowRuns(...args);
  }

  savePost(...args: Parameters<RepositoryAdapter["savePost"]>) {
    assertRepositoryWriteAllowed(this.options);
    return this.delegate.savePost(...args);
  }

  stagePostMedia(
    ...args: Parameters<RepositoryAdapter["stagePostMedia"]>
  ) {
    assertRepositoryWriteAllowed(this.options);
    return this.delegate.stagePostMedia(...args);
  }

  savePostBundle(
    ...args: Parameters<RepositoryAdapter["savePostBundle"]>
  ) {
    assertRepositoryWriteAllowed(this.options);
    return this.delegate.savePostBundle(...args);
  }

  deletePost(...args: Parameters<RepositoryAdapter["deletePost"]>) {
    assertRepositoryWriteAllowed(this.options);
    return this.delegate.deletePost(...args);
  }

  duplicatePost(...args: Parameters<RepositoryAdapter["duplicatePost"]>) {
    assertRepositoryWriteAllowed(this.options);
    return this.delegate.duplicatePost(...args);
  }

  uploadMedia(...args: Parameters<RepositoryAdapter["uploadMedia"]>) {
    assertRepositoryWriteAllowed(this.options);
    return this.delegate.uploadMedia(...args);
  }

  deleteMedia(...args: Parameters<RepositoryAdapter["deleteMedia"]>) {
    assertRepositoryWriteAllowed(this.options);
    return this.delegate.deleteMedia(...args);
  }

  dispatchWorkflow(
    ...args: Parameters<RepositoryAdapter["dispatchWorkflow"]>
  ) {
    assertRepositoryWriteAllowed(this.options, "dispatchWorkflow");
    return this.delegate.dispatchWorkflow(...args);
  }

  renameTaxonomy(
    ...args: Parameters<RepositoryAdapter["renameTaxonomy"]>
  ) {
    assertRepositoryWriteAllowed(this.options);
    return this.delegate.renameTaxonomy(...args);
  }
}

export function withRepositoryWriteGuard(
  repository: RepositoryAdapter,
  options: RepositoryWriteGuardOptions,
): RepositoryAdapter {
  return new WriteGuardedRepositoryAdapter(repository, options);
}
