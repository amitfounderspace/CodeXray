/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig = {
  reactStrictMode: true,
  // Static export for GitHub Pages deployment
  output: isGithubPages ? "export" : undefined,
  // Repo name as base path when deployed to GitHub Pages project site
  basePath: isGithubPages ? "/CodeXray" : "",
  // Required for next/image in static export
  images: isGithubPages ? { unoptimized: true } : {},
  trailingSlash: isGithubPages ? true : false,
  env: {
    // The backend this dashboard observes. Defaults to :8000 but can target
    // any instrumented service exposing /metrics and /logs.
    NEXT_PUBLIC_BACKEND_URL:
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  },
};

module.exports = nextConfig;
