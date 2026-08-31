import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { RepositoryAdapter } from "@/lib/repository/repository";
import {
  type RepositoryWriteGuardOptions,
  withRepositoryWriteGuard,
} from "@/lib/repository/write-guard";

type WriteMethod =
  | "savePost"
  | "stagePostMedia"
  | "savePostBundle"
  | "deletePost"
  | "duplicatePost"
  | "uploadMedia"
  | "deleteMedia"
  | "dispatchWorkflow"
  | "renameTaxonomy";

type ReadMethod =
  | "checkConnection"
  | "listPosts"
  | "getPost"
  | "listMedia"
  | "getMedia"
  | "listWorkflowRuns";

const writeCases: Array<{
  method: WriteMethod;
  invoke: (repository: RepositoryAdapter) => Promise<unknown>;
}> = [
  {
    method: "savePost",
    invoke: async (repository) => repository.savePost({} as never),
  },
  {
    method: "stagePostMedia",
    invoke: async (repository) => repository.stagePostMedia({} as never),
  },
  {
    method: "savePostBundle",
    invoke: async (repository) => repository.savePostBundle({} as never),
  },
  {
    method: "deletePost",
    invoke: async (repository) => repository.deletePost("post.md", "sha", false),
  },
  {
    method: "duplicatePost",
    invoke: async (repository) =>
      repository.duplicatePost("post.md", "sha", "copy"),
  },
  {
    method: "uploadMedia",
    invoke: async (repository) => repository.uploadMedia({} as never),
  },
  {
    method: "deleteMedia",
    invoke: async (repository) => repository.deleteMedia("image.png", "sha"),
  },
  {
    method: "dispatchWorkflow",
    invoke: async (repository) => repository.dispatchWorkflow(),
  },
  {
    method: "renameTaxonomy",
    invoke: async (repository) => repository.renameTaxonomy({} as never),
  },
];

const readCases: Array<{
  method: ReadMethod;
  invoke: (repository: RepositoryAdapter) => Promise<unknown>;
}> = [
  {
    method: "checkConnection",
    invoke: async (repository) => repository.checkConnection(),
  },
  {
    method: "listPosts",
    invoke: async (repository) => repository.listPosts(),
  },
  {
    method: "getPost",
    invoke: async (repository) => repository.getPost("post.md"),
  },
  {
    method: "listMedia",
    invoke: async (repository) => repository.listMedia(),
  },
  {
    method: "getMedia",
    invoke: async (repository) => repository.getMedia("image.png"),
  },
  {
    method: "listWorkflowRuns",
    invoke: async (repository) => repository.listWorkflowRuns(),
  },
];

const allMethods = [
  ...writeCases.map(({ method }) => method),
  ...readCases.map(({ method }) => method),
];

function createDelegate() {
  return Object.fromEntries(
    allMethods.map((method) => [method, vi.fn(async () => undefined)]),
  ) as unknown as RepositoryAdapter;
}

function guard(
  delegate: RepositoryAdapter,
  overrides: Partial<RepositoryWriteGuardOptions> = {},
) {
  return withRepositoryWriteGuard(delegate, {
    branch: "main",
    authMode: "oauth",
    vercel: "1",
    vercelEnv: "preview",
    ...overrides,
  });
}

describe("repository write guard", () => {
  it.each(writeCases)(
    "blocks $method before delegation when Preview targets main",
    async ({ method, invoke }) => {
      const delegate = createDelegate();
      const repository = guard(delegate, {
        contentWritePolicy: "production-main",
      });

      await expect(invoke(repository)).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
        details: {
          branch: "main",
          reason:
            method === "dispatchWorkflow"
              ? "preview-workflow-protected"
              : "preview-main-protected",
        },
      });
      expect(delegate[method]).not.toHaveBeenCalled();
    },
  );

  it.each(["vercelEnv", "vercelTargetEnv"] as const)(
    "does not let production-main override Preview detected by %s",
    async (previewField) => {
      const delegate = createDelegate();
      const repository = guard(delegate, {
        vercelEnv: undefined,
        vercelTargetEnv: undefined,
        [previewField]: "preview",
        contentWritePolicy: "production-main",
      });

      await expect(
        Promise.resolve().then(() => repository.savePost({} as never)),
      ).rejects.toMatchObject({
        status: 403,
        details: { reason: "preview-main-protected" },
      });
      expect(delegate.savePost).not.toHaveBeenCalled();
    },
  );

  it.each(writeCases)(
    "delegates $method when Production explicitly enables main writes",
    async ({ method, invoke }) => {
      const delegate = createDelegate();
      const repository = guard(delegate, {
        vercelEnv: "production",
        contentWritePolicy: "production-main",
      });

      await invoke(repository);

      expect(delegate[method]).toHaveBeenCalledTimes(1);
    },
  );

  it.each(writeCases)(
    "fails closed for $method on Production main when the policy is missing",
    async ({ method, invoke }) => {
      const delegate = createDelegate();
      const repository = guard(delegate, { vercelEnv: "production" });

      await expect(invoke(repository)).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
        details: {
          branch: "main",
          reason: "production-main-policy-required",
        },
      });
      expect(delegate[method]).not.toHaveBeenCalled();
    },
  );

  it("does not expose a malformed policy value in the 403 error", async () => {
    const delegate = createDelegate();
    const repository = guard(delegate, {
      vercelEnv: "production",
      contentWritePolicy: "sensitive-mistyped-value",
    });

    let thrown: unknown;
    try {
      await repository.savePost({} as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect(JSON.stringify(thrown)).not.toContain("sensitive-mistyped-value");
  });

  it.each(writeCases)(
    "allows $method on a non-main, non-Preview branch",
    async ({ method, invoke }) => {
      const delegate = createDelegate();
      const repository = guard(delegate, {
        branch: "admin-preview-smoke",
        vercelEnv: "production",
      });

      await invoke(repository);

      expect(delegate[method]).toHaveBeenCalledTimes(1);
    },
  );

  it("allows content writes to a non-main Preview branch", async () => {
    const delegate = createDelegate();
    const repository = guard(delegate, { branch: "admin-preview-smoke" });

    await repository.savePost({} as never);

    expect(delegate.savePost).toHaveBeenCalledTimes(1);
  });

  it("still blocks workflow dispatch on a non-main Preview branch", async () => {
    const delegate = createDelegate();
    const repository = guard(delegate, { branch: "admin-preview-smoke" });

    await expect(
      Promise.resolve().then(() => repository.dispatchWorkflow()),
    ).rejects.toMatchObject({
      status: 403,
      details: { reason: "preview-workflow-protected" },
    });
    expect(delegate.dispatchWorkflow).not.toHaveBeenCalled();
  });

  it("allows non-Vercel local-cli to write main without a production policy", async () => {
    const delegate = createDelegate();
    const repository = guard(delegate, {
      authMode: "local-cli",
      vercel: undefined,
      vercelEnv: undefined,
      vercelTargetEnv: undefined,
    });

    await repository.savePost({} as never);

    expect(delegate.savePost).toHaveBeenCalledTimes(1);
  });

  it.each(readCases)(
    "allows $method reads even when Preview targets main",
    async ({ method, invoke }) => {
      const delegate = createDelegate();
      const repository = guard(delegate);

      await invoke(repository);

      expect(delegate[method]).toHaveBeenCalledTimes(1);
    },
  );
});
