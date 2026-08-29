import type {
  EditorContext,
  PostPreset,
  PostSummary,
  RepositoryConfig,
  ResolvedPostPreset,
  TaxonomySuggestion,
} from "@/lib/types";

const PREFERRED_CATEGORIES = [
  ["随笔"],
  ["教程", "分享"],
  ["大学", "课程测评"],
  ["高中", "三位一体"],
  ["高中", "语文"],
];

function dateToken(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function applyPresetTemplate(
  template: string,
  sequence: number,
  date = new Date(),
) {
  return template
    .replaceAll("{date}", dateToken(date))
    .replace(/\{seq(?::(\d+))?\}/g, (_match, width?: string) =>
      String(sequence).padStart(width ? Number(width) : 1, "0"),
    );
}

export function resolvePreset(
  preset: PostPreset,
  occupiedSlugs: ReadonlySet<string>,
  date = new Date(),
): ResolvedPostPreset {
  let nextSequence = 1;
  while (
    occupiedSlugs.has(
      applyPresetTemplate(preset.slugTemplate, nextSequence, date),
    )
  ) {
    nextSequence += 1;
  }
  return {
    ...preset,
    nextSequence,
    suggestedSlug: applyPresetTemplate(
      preset.slugTemplate,
      nextSequence,
      date,
    ),
    suggestedTitle: applyPresetTemplate(
      preset.titleTemplate,
      nextSequence,
      date,
    ),
  };
}

function taxonomySuggestions(
  posts: PostSummary[],
  type: "tag" | "category",
): TaxonomySuggestion[] {
  const counts = new Map<string, number>();
  const recent = new Set<string>();
  const sorted = [...posts].sort((a, b) => b.updated.localeCompare(a.updated));
  sorted.slice(0, 8).forEach((post) => {
    const values =
      type === "tag"
        ? post.tags.map((tag) => [tag])
        : post.categories;
    values.forEach((value) => recent.add(value.join(" > ")));
  });
  posts.forEach((post) => {
    const values =
      type === "tag"
        ? post.tags.map((tag) => [tag])
        : post.categories;
    values.forEach((value) => {
      const key = value.join(" > ");
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  if (type === "category") {
    PREFERRED_CATEGORIES.forEach((path) => {
      const key = path.join(" > ");
      if (!counts.has(key)) counts.set(key, 0);
    });
  }
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      value: type === "tag" ? label : label.split(" > "),
      count,
      recent: recent.has(label),
    }))
    .sort((left, right) => {
      if (type === "category") {
        const leftPreferred = PREFERRED_CATEGORIES.findIndex(
          (path) => path.join(" > ") === left.label,
        );
        const rightPreferred = PREFERRED_CATEGORIES.findIndex(
          (path) => path.join(" > ") === right.label,
        );
        if (leftPreferred >= 0 || rightPreferred >= 0) {
          if (leftPreferred < 0) return 1;
          if (rightPreferred < 0) return -1;
          return leftPreferred - rightPreferred;
        }
      }
      return (
        right.count - left.count ||
        Number(right.recent) - Number(left.recent) ||
        left.label.localeCompare(right.label, "zh-CN")
      );
    });
}

export function buildEditorContext(
  posts: PostSummary[],
  config: RepositoryConfig,
): EditorContext {
  const occupiedSlugs = new Set(posts.map((post) => post.slug));
  return {
    presets: config.postPresets.map((preset) =>
      resolvePreset(preset, occupiedSlugs),
    ),
    tags: taxonomySuggestions(posts, "tag"),
    categories: taxonomySuggestions(posts, "category"),
    occupiedSlugs: [...occupiedSlugs].sort(),
  };
}
