import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing engine modules from parent directory
  serverExternalPackages: ['better-sqlite3'],
  output: 'standalone',
};

export default nextConfig;
