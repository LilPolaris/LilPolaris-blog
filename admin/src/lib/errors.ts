import { ZodError } from "zod";

export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "CONFIG_MISSING"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "GITHUB_UNAUTHORIZED"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_ERROR"
  | "UPLOAD_INVALID"
  | "WORKFLOW_UNAVAILABLE"
  | "AI_UNAVAILABLE"
  | "AI_INVALID_RESPONSE"
  | "AI_TIMEOUT"
  | "UNKNOWN";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly status = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

type ErrorResponseOptions = {
  requestId?: string;
  operation?: string;
};

function validRequestId(value?: string) {
  return Boolean(value && /^[a-zA-Z0-9_-]{8,100}$/.test(value));
}

export function createRequestId(value?: string) {
  return validRequestId(value) ? value! : crypto.randomUUID();
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError(
      "VALIDATION",
      error.issues[0]?.message || "提交的数据不合法。",
      400,
      { issues: error.issues },
    );
  }

  const candidate = error as {
    status?: number;
    message?: string;
    response?: { headers?: Record<string, string> };
  };

  if (candidate.status === 401) {
    return new AppError(
      "GITHUB_UNAUTHORIZED",
      "GitHub 凭据无效或已过期，请检查服务端 Token。",
      401,
    );
  }
  if (candidate.status === 403) {
    const remaining = candidate.response?.headers?.["x-ratelimit-remaining"];
    return new AppError(
      remaining === "0" ? "GITHUB_RATE_LIMITED" : "FORBIDDEN",
      remaining === "0"
        ? "GitHub API 请求额度已用完，请稍后重试。"
        : "GitHub 拒绝了此次操作，请检查仓库权限。",
      403,
    );
  }
  if (candidate.status === 404) {
    return new AppError(
      "NOT_FOUND",
      "请求的仓库、分支或文件不存在。",
      404,
    );
  }
  if (candidate.status === 409 || candidate.status === 422) {
    return new AppError(
      "CONFLICT",
      "远程版本已发生变化，请查看差异后重新加载或强制保存。",
      409,
    );
  }
  return new AppError(
    "UNKNOWN",
    candidate.message || "发生了未预期的错误。",
    500,
  );
}

export function errorResponse(
  error: unknown,
  options: ErrorResponseOptions = {},
) {
  const appError = toAppError(error);
  const requestId = createRequestId(options.requestId);
  console.error(
    JSON.stringify({
      level: "error",
      event: "api.error",
      requestId,
      operation: options.operation || "unknown",
      code: appError.code,
      status: appError.status,
      message: appError.message,
    }),
  );
  return Response.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
        requestId,
      },
    },
    {
      status: appError.status,
      headers: { "x-request-id": requestId },
    },
  );
}
