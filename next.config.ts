import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for the single-server bundle (FastAPI serves the UI).
  // Unset for dev / Docker builds, which keep the Node server build.
  output: process.env.TALLY_STATIC_EXPORT === "1" ? "export" : undefined,
};

export default nextConfig;
