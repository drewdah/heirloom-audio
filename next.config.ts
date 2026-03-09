import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
