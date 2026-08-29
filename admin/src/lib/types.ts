export type PostKind = "post" | "draft";

export type CategoryPath = string[];

export type EditorMode = "live" | "source";

export type AiProvider = "ollama" | "deepseek" | "openai-compatible";

export interface AiMetadataConfig {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface PostPreset {
  id: string;
  label: string;
  slugTemplate: string;
  titleTemplate: string;
  tags: string[];
  categories: CategoryPath[];
  layout: string;
}

export interface ResolvedPostPreset extends PostPreset {
  nextSequence: number;
  suggestedSlug: string;
  suggestedTitle: string;
}

export interface TaxonomySuggestion {
  label: string;
  value: string | CategoryPath;
  count: number;
  recent: boolean;
}

export interface EditorContext {
  presets: ResolvedPostPreset[];
  tags: TaxonomySuggestion[];
  categories: TaxonomySuggestion[];
  occupiedSlugs: string[];
}

export interface RepositoryConfig {
  owner: string;
  repo: string;
  branch: string;
  postsPath: string;
  draftsPath: string;
  imagesPath: string;
  publicBlogUrl: string;
  timezone: string;
  workflowId: string;
  defaultLayout: string;
  defaultCategory: string;
  commitTemplate: string;
  autoDispatch: boolean;
  uploadLimitMb: number;
  adapter: "github" | "mock";
  editorDefaultMode: EditorMode;
  postPresets: PostPreset[];
}

export interface PostSummary {
  id: string;
  path: string;
  kind: PostKind;
  sha: string;
  title: string;
  slug: string;
  date: string;
  updated: string;
  tags: string[];
  categories: CategoryPath[];
  excerpt: string;
  draft: boolean;
}

export interface EditableFrontMatter {
  title: string;
  date: string;
  firstPublishedAt: string;
  updated: string;
  slug: string;
  tags: string[];
  categories: CategoryPath[];
  excerpt: string;
  cover: string;
  draft: boolean;
  layout: string;
  permalink: string;
}

export interface AiMetadataSuggestion {
  slug: string;
  tags: string[];
  categories: CategoryPath[];
}

export interface PostDocument extends PostSummary {
  body: string;
  frontMatter: EditableFrontMatter;
  rawFrontMatter: string;
  headSha: string;
}

export interface PostMutationInput {
  currentPath?: string;
  expectedSha?: string;
  expectedHeadSha?: string;
  kind: PostKind;
  slug: string;
  body: string;
  frontMatter: EditableFrontMatter;
  force?: boolean;
}

export interface MutationResult {
  path: string;
  sha: string;
  headSha: string;
  commitSha: string;
  message: string;
}

export interface PendingMedia {
  id: string;
  name: string;
  contentType: string;
  size: number;
  blob: Blob;
  alt: string;
  previewUrl?: string;
}

export interface PostBundleMediaInput {
  id: string;
  name: string;
  contentType: string;
  bytes: Uint8Array;
  alt: string;
}

export interface PostBundleMutationInput extends PostMutationInput {
  media: PostBundleMediaInput[];
}

export interface PostBundleMutationResult extends MutationResult {
  body: string;
  uploadedMedia: MediaAsset[];
  mediaNameMap: Record<string, string>;
}

export interface MediaAsset {
  id: string;
  path: string;
  name: string;
  sha: string;
  size: number;
  scope: "global" | "post";
  postSlug?: string;
  uploadedAt?: string;
  downloadUrl?: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  branch: string;
  event: string;
  status: string;
  conclusion: string | null;
  title: string;
  commitSha: string;
  startedAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface TaxonomyEntry {
  name: string;
  count: number;
  type: "tag" | "category";
}

export interface DashboardData {
  totalPosts: number;
  totalDrafts: number;
  recentUpdated: PostSummary[];
  recentPublished: PostSummary[];
  repositoryConnected: boolean;
  lastSyncAt: string;
  latestRun: WorkflowRun | null;
  sourceStatus?: {
    posts: "ok" | "error";
    connection: "ok" | "error";
    workflow: "ok" | "error";
  };
  sourceErrors?: Partial<
    Record<"posts" | "connection" | "workflow", string>
  >;
}

export interface RenameTaxonomyInput {
  type: "tag" | "category";
  from: string;
  to: string;
  fromPath?: string[];
  expectedHeadSha?: string;
}

export interface TaxonomyMutationResult {
  affected: number;
  commitSha: string;
  headSha: string;
}
