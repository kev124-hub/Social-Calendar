import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Worktree has no node_modules — point root at the parent repo where they live
    root: path.resolve(__dirname, "../../../.."),
  },
};

export default nextConfig;
