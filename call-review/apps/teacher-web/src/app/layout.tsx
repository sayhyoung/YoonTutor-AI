import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "윤선생 AI 전화관리 | 교사용",
  description: "학습자의 AI 관리 전화 현황과 후속 학습을 확인합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://static.wanted.co.kr/fonts/wantedsans/WantedSansVariable.min.css"
        />
        <link
          rel="stylesheet"
          href="https://static.wanted.co.kr/fonts/pretendard/pretendard/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
