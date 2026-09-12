import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Vercel: 0 cancels, 1 builds. Compare all changes since the last successful
// project/branch deployment, not just the last commit in a push or merge.
export function ignoredBuildExitCode({
  cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA,
} = {}) {
  if (!previousSha || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(previousSha))
    return 1;
  try {
    execFileSync("git", ["diff", "--quiet", previousSha, "HEAD", "--", "."], {
      cwd,
      stdio: "pipe",
      timeout: 10_000,
    });
    return 0;
  } catch {
    // Changes, missing shallow history and Git failures all require a build.
    return 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const code = ignoredBuildExitCode();
  console.log(
    code === 0
      ? "Admin unchanged since the last successful deployment; skipping build."
      : "Admin changed or deployment baseline unavailable; building.",
  );
  process.exitCode = code;
}
