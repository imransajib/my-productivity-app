import type { NextConfig } from "next";
import pkg from "./package.json";

// Unique per build: installed apps compare this with /api/version to detect a new release.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || Date.now().toString(36);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
