import { requireAdminApi } from "@/lib/auth-guard";
import {
  configurationStatus,
  getBaseRepositoryConfig,
  requireGitHubToken,
} from "@/lib/config";
import { errorResponse } from "@/lib/errors";
import { GitHubRepositoryAdapter } from "@/lib/repository/github";
import { MockRepositoryAdapter } from "@/lib/repository/mock";
import {
  clearSettingsOverrides,
  getEffectiveRepositoryConfig,
  getSettingsStorageStatus,
  parseSettingsOverrides,
  saveSettingsOverrides,
} from "@/lib/settings";

export async function GET() {
  try {
    await requireAdminApi();
    return Response.json({
      data: {
        config: await getEffectiveRepositoryConfig(),
        status: configurationStatus(),
        storage: await getSettingsStorageStatus(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    return Response.json({ data: await saveSettingsOverrides(await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdminApi();
    const overrides = parseSettingsOverrides(await request.json());
    const config = { ...getBaseRepositoryConfig(), ...overrides };
    // This temporary adapter is used only for the read-only connection check.
    // Every runtime mutation must obtain its adapter through getRepository(),
    // which applies the Preview/main write guard.
    const repository =
      config.adapter === "mock"
        ? new MockRepositoryAdapter(config)
        : new GitHubRepositoryAdapter(config, requireGitHubToken());
    await repository.checkConnection();
    return Response.json({
      data: {
        connected: true,
        config,
        message: `已连接 ${config.owner}/${config.repo} 的 ${config.branch} 分支；三条内容路径格式有效。`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await requireAdminApi();
    return Response.json({ data: await clearSettingsOverrides() });
  } catch (error) {
    return errorResponse(error);
  }
}
