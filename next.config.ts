import type { NextConfig } from "next";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? version,
  },
  output: "standalone",
  async rewrites() {
    return [
      { source: "/covers/:filename", destination: "/api/covers/:filename" },
      { source: "/takes/:filename", destination: "/api/takes/file/:filename" },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "drive.google.com" },
      { protocol: "https", hostname: "*.googleapis.com" },
    ],
  },
};

export default nextConfig;
