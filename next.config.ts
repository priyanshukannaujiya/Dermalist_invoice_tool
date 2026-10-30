import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "pg"],
  outputFileTracingRoot: path.resolve(__dirname),
  experimental: {},
};

export default nextConfig;
