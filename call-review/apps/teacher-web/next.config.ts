import type { NextConfig } from "next";

// 교사 화면은 /api/*를 전화관리 BFF(web 앱)로 넘긴다. 브라우저 입장에서는 같은 origin이라
// BFF가 설정하는 httpOnly 세션 쿠키가 이 화면의 origin에 저장된다.
const bffUrl = (process.env.CALL_REVIEW_BFF_URL ?? "http://localhost:3000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@yoon-call/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${bffUrl}/api/:path*` }];
  },
};

export default nextConfig;
