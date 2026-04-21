import type { NextConfig } from "next";
import path from "path";

const GATEWAY_PORT = 10623;

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${GATEWAY_PORT}/api/:path*`,
      },
      {
        source: "/v1/:path*",
        destination: `http://127.0.0.1:${GATEWAY_PORT}/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/ws",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

if (process.env.BUILD_MODE === "export") {
  nextConfig.output = "export";
  nextConfig.distDir = "../dist/web";
  nextConfig.images = { unoptimized: true };
}

export default nextConfig;
