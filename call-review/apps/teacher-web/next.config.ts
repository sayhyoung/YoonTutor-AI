import path from "node:path";

import type { NextConfig } from "next";

// 공유 패키지(../../packages/shared)와 디자인 토큰(../../tokens.css)을 상대 경로로 쓴다.
// App Hosting은 이 폴더(apps/teacher-web)를 루트로 빌드하지만 저장소 전체를 받아 오므로 상위 폴더도 읽을 수 있다.
const workspaceRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@yoon-call/shared"],
  // 개발(next dev, Turbopack)은 상위 폴더 파일을 읽도록 빌드 루트를 call-review로 둔다.
  // 운영 빌드(next build --webpack)는 루트를 이 폴더로 고정한다. 루트가 바뀌면 standalone 결과물이
  // apps/teacher-web 아래로 들어가 App Hosting Next.js 어댑터가 찾지 못한다(Nx·Turborepo만 자동 처리).
  ...(process.env.NODE_ENV === "development"
    ? { turbopack: { root: workspaceRoot } }
    : { outputFileTracingRoot: process.cwd() }),
};

export default nextConfig;
