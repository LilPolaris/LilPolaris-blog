import { realpathSync } from "node:fs";
import type { NextConfig } from "next";

// Keep Turbopack and standalone tracing on the same physical path when this
// repository is opened through the D:\\book-back-tool junction.
const projectRoot = realpathSync(process.cwd());

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
