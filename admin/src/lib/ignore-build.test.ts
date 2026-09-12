import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ignoredBuildExitCode } from "../../scripts/ignore-build.mjs";

const prefix = path.join(tmpdir(), "admin-ignore-build-test-");
const directories: string[] = [];
function fixture() {
  const root = mkdtempSync(prefix);
  directories.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  git("init", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  const cwd = path.join(root, "admin");
  mkdirSync(cwd);
  const commit = (file: string, content: string) => {
    writeFileSync(path.join(root, file), content);
    git("add", ".");
    git("commit", "-m", "fixture");
    return git("rev-parse", "HEAD");
  };
  const base = commit("admin/app.txt", "initial");
  return { root, cwd, git, commit, base };
}
afterAll(() => {
  for (const directory of directories) {
    if (!path.resolve(directory).startsWith(path.resolve(prefix)))
      throw new Error("Unsafe test cleanup path");
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Vercel ignored build decision", () => {
  it("skips unrelated content changes after a successful deployment", () => {
    const f = fixture();
    f.commit("post.md", "new post");
    expect(ignoredBuildExitCode({ cwd: f.cwd, previousSha: f.base })).toBe(0);
  });
  it("builds when an admin change is hidden behind the final non-admin commit", () => {
    const f = fixture();
    f.commit("admin/app.txt", "changed");
    f.commit("post.md", "post");
    expect(ignoredBuildExitCode({ cwd: f.cwd, previousSha: f.base })).toBe(1);
  });
  it("builds after merging main into a branch containing undeployed admin changes", () => {
    const f = fixture();
    f.git("switch", "-c", "feature");
    f.commit("admin/app.txt", "changed");
    f.git("switch", "main");
    f.commit("post.md", "post");
    f.git("switch", "feature");
    f.git("merge", "--no-edit", "main");
    expect(f.git("diff", "HEAD^", "HEAD", "--", "admin")).toBe("");
    expect(ignoredBuildExitCode({ cwd: f.cwd, previousSha: f.base })).toBe(1);
  });
  it("builds without a valid baseline or available history", () => {
    const f = fixture();
    for (const previousSha of ["", "invalid", "a".repeat(40)]) {
      expect(ignoredBuildExitCode({ cwd: f.cwd, previousSha })).toBe(1);
    }
    expect(
      ignoredBuildExitCode({
        cwd: path.join(f.root, "missing"),
        previousSha: f.base,
      }),
    ).toBe(1);
  });
});
