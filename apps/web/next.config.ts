import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@rutgers-gpt/shared"],
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
};

export default nextConfig;
