import { NextResponse } from "next/server";

import { StudyApiError, isStudyApiConfigured, studyFetch } from "@/lib/study-api/client";
import { mapStudyResultsToLearningItems } from "@/lib/study-api/mapping";
import type { StudyQueryData } from "@/lib/study-api/types";
import type { LearningItem } from "@/lib/types";

export const runtime = "nodejs";

const MAX_RANGE_DAYS = 365; // 서버 제약: 조회 기간 1년 초과 시 400(ST-1100)

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

// study-api 학습조회(기간)는 사내망 전용 서버이며 현재 인증 없이 조회 가능.
// BFF(서버 라우트)가 호출하므로 브라우저 CORS 문제가 없다.
// 인증이 적용되면 STUDY_API_ACCESS_TOKEN을 Bearer로 첨부한다.
export async function GET(request: Request) {
  if (!isStudyApiConfigured()) {
    // LEARNING_API_BASE_URL 미설정(예: 클라우드 배포 환경) → 빈 목록.
    return NextResponse.json({ items: [], source: "unconfigured" });
  }

  const sp = new URL(request.url).searchParams;
  const customerNo = sp.get("customerNo") ?? sp.get("studentId") ?? "";
  if (!customerNo.trim()) {
    return NextResponse.json({ error: "customerNo is required" }, { status: 400 });
  }

  // 조회 기간 결정: 쿼리 > 환경변수 > 기본(최근 LOOKBACK일).
  const lookbackDays = Number(process.env.STUDY_API_LOOKBACK_DAYS ?? "90") || 90;
  const today = toIsoDate(new Date());
  let endDate =
    sp.get("to") ?? sp.get("studyEndDate") ?? process.env.STUDY_API_DEMO_END ?? process.env.STUDY_API_DEMO_DATE ?? today;
  let startDate =
    sp.get("from") ??
    sp.get("studyStartDate") ??
    process.env.STUDY_API_DEMO_START ??
    process.env.STUDY_API_DEMO_DATE ??
    shiftDays(endDate, -lookbackDays);

  // 시작>종료면 교정, 1년 초과면 시작일을 당겨 클램프.
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  if (shiftDays(startDate, MAX_RANGE_DAYS) < endDate) {
    startDate = shiftDays(endDate, -MAX_RANGE_DAYS);
  }

  const accessToken = process.env.STUDY_API_ACCESS_TOKEN || undefined;
  const query = `studyStartDate=${encodeURIComponent(startDate)}&studyEndDate=${encodeURIComponent(
    endDate,
  )}&customerNo=${encodeURIComponent(customerNo)}`;

  // smart-befly(단어/문장)와 4skill-befly(평가 등) 기간조회를 함께 호출하고 오답만 합친다.
  const [sb, fourSkill] = await Promise.allSettled([
    studyFetch<StudyQueryData>(`/api/study/results/smart-befly/range?${query}`, { accessToken }),
    studyFetch<StudyQueryData>(`/api/study/results/4skill-befly/range?${query}`, { accessToken }),
  ]);

  const items: LearningItem[] = [];
  let lastError: unknown = null;

  for (const result of [sb, fourSkill]) {
    if (result.status === "fulfilled" && result.value) {
      items.push(...mapStudyResultsToLearningItems(result.value, customerNo));
    } else if (result.status === "rejected") {
      lastError = result.reason;
    }
  }

  // 둘 다 실패한 경우에만 에러로 응답(부분 성공은 통과).
  if (items.length === 0 && lastError) {
    const status = lastError instanceof StudyApiError ? lastError.status : 502;
    return NextResponse.json(
      { items: [], source: "study-api", error: String(lastError) },
      { status },
    );
  }

  return NextResponse.json({ items, source: "study-api", studyStartDate: startDate, studyEndDate: endDate });
}
