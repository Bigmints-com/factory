import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing engine modules from parent directory
  serverExternalPackages: ['yaml', 'better-sqlite3'],
};

export default nextConfig;
