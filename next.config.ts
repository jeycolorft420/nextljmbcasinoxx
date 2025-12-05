import type { NextConfig } from "next";
import "./src/lib/env"; // 👈 Validate env vars on import

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
