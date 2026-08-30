import { realpathSync } from "node:fs";
import type { NextConfig } from "next";

// Self-hosted launcher/Docker builds need standalone output. Vercel applies
// its own file tracing and fails if a forced standalone build removes the
// default next-server trace manifest used by its onBuildComplete hook.
const projectRoot = realpathSync(process.cwd());
const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  ...(isVercelBuild
    ? {}
    : {
        output: "standalone" as const,
        outputFileTracingRoot: projectRoot,
      }),
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
