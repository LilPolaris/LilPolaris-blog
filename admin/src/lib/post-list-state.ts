export type PostListStatus = "all" | "post" | "draft";
export type PostListSort = "updated" | "date";

export interface PostListState {
  query: string;
  status: PostListStatus;
  category: string;
  tag: string;
  sort: PostListSort;
  page: number;
}

export const DEFAULT_POST_LIST_STATE: PostListState = {
  query: "",
  status: "all",
  category: "",
  tag: "",
  sort: "updated",
  page: 1,
};

function positivePage(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parsePostListState(
  search: string | URLSearchParams,
  fixedStatus?: Exclude<PostListStatus, "all">,
): PostListState {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const requestedStatus = params.get("status");
  const requestedSort = params.get("sort");

  return {
    query: params.get("query") || "",
    status:
      fixedStatus ||
      (requestedStatus === "post" || requestedStatus === "draft"
        ? requestedStatus
        : "all"),
    category: params.get("category") || "",
    tag: params.get("tag") || "",
    sort: requestedSort === "date" ? "date" : "updated",
    page: positivePage(params.get("page")),
  };
}

export function postListSearchParams(
  state: PostListState,
  fixedStatus?: Exclude<PostListStatus, "all">,
) {
  const params = new URLSearchParams();
  if (state.query) params.set("query", state.query);
  if (!fixedStatus && state.status !== "all") {
    params.set("status", state.status);
  }
  if (state.category) params.set("category", state.category);
  if (state.tag) params.set("tag", state.tag);
  if (state.sort !== "updated") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function postListUrl(
  pathname: "/posts" | "/drafts",
  state: PostListState,
  fixedStatus?: Exclude<PostListStatus, "all">,
) {
  const search = postListSearchParams(state, fixedStatus).toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}

export function safePostListReturnTo(
  value: string | string[] | undefined,
  fallback: "/posts" | "/drafts" = "/posts",
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(candidate, "https://admin.local");
    if (url.origin !== "https://admin.local") return fallback;
    if (url.pathname !== "/posts" && url.pathname !== "/drafts") {
      return fallback;
    }
    const pathname = url.pathname as "/posts" | "/drafts";
    const fixedStatus = pathname === "/drafts" ? "draft" : undefined;
    return postListUrl(
      pathname,
      parsePostListState(url.searchParams, fixedStatus),
      fixedStatus,
    );
  } catch {
    return fallback;
  }
}
