import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { toScheduleView } from "@/lib/call-review/schedule";
import { getSchedule } from "@/lib/call-review/schedule-store";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "GET, OPTIONS";

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 학생 앱: 교사가 설정한 내 전화 일정(읽기 전용)과 다음 통화 시각.
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) };
  const student = readMobileToken(request);
  if (!student) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401, headers });
  if (!isServerStoreConfigured()) return NextResponse.json({ schedule: null, configured: false }, { headers });

  try {
    const stored = await getSchedule(student.subjectId);
    return NextResponse.json({ schedule: stored ? toScheduleView(stored) : null, configured: true }, { headers });
  } catch {
    return NextResponse.json({ error: "일정을 불러오지 못했어요." }, { status: 502, headers });
  }
}
