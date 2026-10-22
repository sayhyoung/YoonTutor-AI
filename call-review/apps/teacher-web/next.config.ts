import path from "node:path";

import type { NextConfig } from "next";

// 교사 화면은 /api/*를 전화관리 BFF(web 앱)로 넘긴다. 브라우저 입장에서는 같은 origin이라
// BFF가 설정하는 httpOnly 세션 쿠키가 이 화면의 origin에 저장된다.
const bffUrl = (process.env.CALL_REVIEW_BFF_URL ?? "http://localhost:3000").replace(/\/+$/, "");

// 공유 패키지(../../packages/shared)를 상대 경로로 쓰므로 빌드 루트를 call-review 폴더로 잡는다.
// App Hosting은 이 폴더(apps/teacher-web)를 루트로 빌드하지만 저장소 전체를 받아 오므로 상위 폴더도 읽을 수 있다.
const workspaceRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@yoon-call/shared"],
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${bffUrl}/api/:path*` }];
  },
};

export default nextConfig;
