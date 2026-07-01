import { NextResponse } from "next/server";

import { StudyApiError, isStudyApiConfigured } from "@/lib/study-api/client";
import { authedStudyFetch } from "@/lib/study-api/server-fetch";
import type { TeacherCustomer } from "@/lib/study-api/types";

export const runtime = "nodejs";

// 교사 소속 회원 목록. 쿠키의 교사 accessToken으로 study-api를 호출한다.
// (로그인 시 role=teacher로 발급된 토큰이어야 함)
export async function GET() {
  if (!isStudyApiConfigured()) {
    return NextResponse.json({ customers: [], source: "unconfigured" });
  }

  try {
    const data = await authedStudyFetch<TeacherCustomer[] | { customers?: TeacherCustomer[] }>(
      "/api/teacher/customers",
    );
    const customers = Array.isArray(data) ? data : (data?.customers ?? []);
    // 화면 표시에 필요한 최소 필드만 정규화해서 반환.
    const normalized = customers.map((c) => ({
      customerNo: String(c.customerNo),
      customerName: c.customerName ?? "",
      schoolYear: c.schoolYear ?? 0,
    }));
    return NextResponse.json({ customers: normalized, source: "study-api" });
  } catch (error) {
    const status = error instanceof StudyApiError ? error.status : 502;
    return NextResponse.json(
      { customers: [], source: "study-api", error: String(error) },
      { status },
    );
  }
}
