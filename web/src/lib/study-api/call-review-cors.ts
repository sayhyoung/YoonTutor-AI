// 모바일 전화관리 앱(웹 프리뷰 포함)이 BFF를 다른 origin에서 호출할 때의 CORS 헤더.
// 네이티브 앱 요청에는 Origin이 없어 CORS가 적용되지 않는다.

// 개발 중에는 Expo 웹 프리뷰 포트가 바뀌어도 되도록 localhost 전체를 허용한다.
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function isAllowedOrigin(origin: string): boolean {
  const configured = process.env.CALL_REVIEW_MOBILE_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured?.length) return configured.includes(origin);
  return process.env.NODE_ENV !== "production" && DEV_ORIGIN.test(origin);
}

export function corsHeaders(request: Request, methods: string): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function preflight(request: Request, methods: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, methods) });
}
