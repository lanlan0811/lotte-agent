import type { NextConfig } from "next";
import path from "path";

const apiPort = process.env.LOTTE_API_PORT || "10623";
const apiHost = process.env.LOTTE_API_HOST || "127.0.0.1";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "out",
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  trailingSlash: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://${apiHost}:${apiPort}/api/:path*`,
      },
      {
        source: "/v1/:path*",
        destination: `http://${apiHost}:${apiPort}/v1/:path*`,
      },
      {
        source: "/ws",
        destination: `ws://${apiHost}:${apiPort}/ws`,
      },
    ];
  },
};

export default nextConfig;
