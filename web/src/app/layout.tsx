import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "윤선생 AI 코치",
  description: "Firebase 기반 AI 복습 코칭 프로토타입",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
