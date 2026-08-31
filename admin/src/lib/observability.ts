import { createRequestId } from "@/lib/errors";

export type ApiRequestContext = {
  operation: string;
  requestId: string;
  startedAt: number;
};

type SafeLogFields = Record<
  string,
  boolean | number | string | null | undefined
>;

export function beginApiRequest(
  request: Request,
  operation: string,
): ApiRequestContext {
  const context = {
    operation,
    requestId: createRequestId(request.headers.get("x-request-id") || undefined),
    startedAt: Date.now(),
  };
  logApiEvent(context, "api.request.started");
  return context;
}

export function logApiEvent(
  context: ApiRequestContext,
  event: string,
  fields: SafeLogFields = {},
) {
  console.info(
    JSON.stringify({
      level: "info",
      event,
      requestId: context.requestId,
      operation: context.operation,
      elapsedMs: Date.now() - context.startedAt,
      ...fields,
    }),
  );
}

export function jsonWithRequestId(
  context: ApiRequestContext,
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("x-request-id", context.requestId);
  return Response.json(body, { ...init, headers });
}
