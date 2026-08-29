import { AppError } from "@/lib/errors";

export function requireSameOriginRequest(
  request: Request,
  options?: { json?: boolean; maxContentLengthBytes?: number },
) {
  const requestUrl = new URL(request.url);
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto") || requestUrl.protocol.slice(0, -1);
  const allowedOrigins = new Set([requestUrl.origin]);
  if (forwardedHost) {
    allowedOrigins.add(`${forwardedProtocol}://${forwardedHost}`);
  }
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");
  let refererOrigin = "";
  try {
    refererOrigin = referer ? new URL(referer).origin : "";
  } catch {
    refererOrigin = "";
  }
  const originAllowed = Boolean(
    fetchSite === "same-origin" ||
      (origin && allowedOrigins.has(origin)) ||
      (refererOrigin && allowedOrigins.has(refererOrigin)),
  );
  if (
    !originAllowed ||
    (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "为保护 API Key，此操作只允许从当前后台页面发起。",
      403,
    );
  }
  if (
    options?.json &&
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
      "application/json"
  ) {
    throw new AppError(
      "VALIDATION",
      "请求必须使用 application/json。",
      415,
    );
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (
    options?.maxContentLengthBytes &&
    Number.isFinite(contentLength) &&
    contentLength > options.maxContentLengthBytes
  ) {
    throw new AppError(
      "VALIDATION",
      "请求内容过大，请缩短文章内容后重试。",
      413,
    );
  }
}
