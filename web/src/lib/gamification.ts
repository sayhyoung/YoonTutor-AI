import type { MasteryStatus, SessionResult } from "./types";

// 게이미피케이션 영속 상태. Firestore: students/{studentId}/meta/gamification
export type GamificationState = {
  stars: number; // 누적 별
  streak: {
    current: number; // 현재 연속 학습일
    best: number;
    lastStudyDate: string; // "YYYY-MM-DD" (KST 기준)
  };
  totalSessions: number;
  updatedAt: string;
};

export function emptyGamification(): GamificationState {
  return {
    stars: 0,
    streak: { current: 0, best: 0, lastStudyDate: "" },
    totalSessions: 0,
    updatedAt: "",
  };
}

// 완료 기반 보상: 재복습(Not mastered)도 1개, 0개 금지.
export function starsForStatus(status: MasteryStatus): number {
  if (status === "Perfect") return 3;
  if (status === "Good") return 2;
  return 1; // "Not mastered" — 다시 도전도 별 1개
}

export function starsForSession(results: SessionResult[]): number {
  return results.reduce((sum, r) => sum + starsForStatus(r.status), 0);
}

// "YYYY-MM-DD" 를 하루 단위로 이동(날짜 문자열 기준, UTC 산술로 일관 처리).
function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 오늘 날짜를 KST(Asia/Seoul) 기준 "YYYY-MM-DD"로 반환. (로컬/UTC 혼용 금지)
export function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

// 같은 날 재학습 → 변화 없음 / 어제가 lastStudyDate → current+1 / 그 외 → 1로 리셋. best는 max 갱신.
export function nextStreak(
  prev: GamificationState["streak"],
  todayKstDate: string,
): GamificationState["streak"] {
  if (prev.lastStudyDate === todayKstDate) {
    return prev;
  }
  const current = prev.lastStudyDate === shiftIsoDate(todayKstDate, -1) ? prev.current + 1 : 1;
  return {
    current,
    best: Math.max(prev.best, current),
    lastStudyDate: todayKstDate,
  };
}

// 세션 결과를 이전 상태에 반영한 새 상태를 계산(순수). 별은 매 세션 누적, 스트릭은 하루 1회.
export function applySessionToState(
  prev: GamificationState,
  results: SessionResult[],
  todayKstDate: string,
  nowIso: string,
): GamificationState {
  return {
    stars: prev.stars + starsForSession(results),
    streak: nextStreak(prev.streak, todayKstDate),
    totalSessions: prev.totalSessions + 1,
    updatedAt: nowIso,
  };
}
