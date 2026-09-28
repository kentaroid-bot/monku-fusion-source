import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
