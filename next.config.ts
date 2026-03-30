import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        "100.118.154.83:3020",
        "localhost:3020",
        "127.0.0.1:3020",
      ],
    },
  },
};

export default nextConfig;
