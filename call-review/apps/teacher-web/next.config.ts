import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@yoon-call/shared"],
};

export default nextConfig;
