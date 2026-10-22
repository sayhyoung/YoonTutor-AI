// 교사 화면의 /api/* 요청을 전화관리 BFF(web 앱)로 그대로 넘긴다.
// App Hosting에서는 next.config의 외부 주소 rewrite가 BFF에 닿지 못해(구글 앞단 401) 서버에서 직접 중계한다.
// 브라우저 입장에서는 같은 origin이라 BFF가 주는 httpOnly 세션 쿠키가 이 화면의 origin에 저장된다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORWARD_REQUEST_HEADERS = ["accept", "authorization", "content-type", "cookie"];
const FORWARD_RESPONSE_HEADERS = ["cache-control", "content-disposition", "content-type", "location"];

function bffUrl(): string {
  return (process.env.CALL_REVIEW_BFF_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = `${bffUrl()}/api/${path.map(encodeURIComponent).join("/")}${incoming.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "서버에 연결하지 못했어요." }, { status: 502 });
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
