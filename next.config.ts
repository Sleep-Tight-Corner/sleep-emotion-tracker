import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName =
  process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "sleep-emotion-tracker";
const basePath = isGitHubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  basePath,
  trailingSlash: isGitHubPages,
  typescript: {
    tsconfigPath: isGitHubPages ? "tsconfig.github.json" : "tsconfig.json",
  },
};

export default nextConfig;
