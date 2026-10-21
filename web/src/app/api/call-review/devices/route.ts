import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { registerDevice, unregisterDevice } from "@/lib/call-review/device-store";
import { isExpoPushToken } from "@/lib/call-review/push";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "POST, DELETE, OPTIONS";

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

async function readBody(request: Request): Promise<{ token: string; platform: string } | null> {
  try {
    const body = (await request.json()) as { token?: unknown; platform?: unknown };
    if (!isExpoPushToken(body.token)) return null;
    const platform = body.platform === "ios" || body.platform === "android" ? body.platform : "unknown";
    return { token: body.token, platform };
  } catch {
    return null;
  }
}

// 학생 기기의 푸시 토큰 등록(로그인·앱 실행 때)과 해제(로그아웃 때).
async function handle(request: Request, action: "register" | "unregister") {
  const headers = { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) };
  const student = readMobileToken(request);
  if (!student) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401, headers });
  if (!isServerStoreConfigured()) return NextResponse.json({ ok: false, configured: false }, { headers });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "푸시 토큰이 올바르지 않아요." }, { status: 400, headers });
  try {
    if (action === "register") await registerDevice(student.subjectId, body.token, body.platform);
    else await unregisterDevice(student.subjectId, body.token);
    return NextResponse.json({ ok: true, configured: true }, { headers });
  } catch {
    return NextResponse.json({ error: "기기를 등록하지 못했어요." }, { status: 502, headers });
  }
}

export function POST(request: Request) {
  return handle(request, "register");
}

export function DELETE(request: Request) {
  return handle(request, "unregister");
}
