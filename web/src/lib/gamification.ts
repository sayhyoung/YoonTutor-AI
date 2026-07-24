import type { MasteryStatus, SessionResult } from "./types";

export const XP_REWARDS = {
  sessionComplete: 20,
  itemComplete: 5,
  retrySuccess: 5,
} as const;

// 누적 XP 기준 레벨 시작점. 파일럿에서는 명시적 테이블로 운영해
// 실제 학습 데이터에 따라 쉽게 조정할 수 있게 한다.
export const LEVEL_THRESHOLDS = [
  0, 60, 150, 280, 450, 660, 910, 1200, 1530, 1900,
  2310, 2760, 3250, 3780, 4350, 4960, 5610, 6300, 7030, 7800,
] as const;

// 게이미피케이션 영속 상태. Firestore: students/{studentId}/meta/gamification
export type GamificationState = {
  stars: number; // 누적 별
  xp: number; // Phase 1에서 화면에 노출할 누적 성장치
  level: number; // 현재는 1로 마이그레이션하고 Phase 1에서 XP 커브와 연결
  streak: {
    current: number; // 현재 연속 학습일
    best: number;
    lastStudyDate: string; // "YYYY-MM-DD" (KST 기준)
    freezesAvailable: number;
  };
  totalSessions: number;
  activeCosmetics: {
    hat?: string;
    glasses?: string;
    background?: string;
  };
  updatedAt: string;
};

export function emptyGamification(): GamificationState {
  return {
    stars: 0,
    xp: 0,
    level: 1,
    streak: {
      current: 0,
      best: 0,
      lastStudyDate: "",
      freezesAvailable: 0,
    },
    totalSessions: 0,
    activeCosmetics: {},
    updatedAt: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

// 기존 Firestore/localStorage 문서에는 신규 필드가 없을 수 있다.
// 모든 읽기 경로에서 이 함수를 거쳐 undefined/NaN 없이 안전하게 마이그레이션한다.
export function normalizeGamification(raw: unknown): GamificationState {
  const value = isRecord(raw) ? raw : {};
  const streak = isRecord(value.streak) ? value.streak : {};
  const cosmetics = isRecord(value.activeCosmetics)
    ? value.activeCosmetics
    : {};
  const xp = finiteNumber(value.xp, 0);
  const activeCosmetics: GamificationState["activeCosmetics"] = {};
  if (typeof cosmetics.hat === "string") {
    activeCosmetics.hat = cosmetics.hat;
  }
  if (typeof cosmetics.glasses === "string") {
    activeCosmetics.glasses = cosmetics.glasses;
  }
  if (typeof cosmetics.background === "string") {
    activeCosmetics.background = cosmetics.background;
  }

  return {
    stars: finiteNumber(value.stars, 0),
    xp,
    level: levelFromXp(xp),
    streak: {
      current: Math.floor(finiteNumber(streak.current, 0)),
      best: Math.floor(finiteNumber(streak.best, 0)),
      lastStudyDate:
        typeof streak.lastStudyDate === "string"
          ? streak.lastStudyDate
          : "",
      freezesAvailable: Math.floor(
        finiteNumber(streak.freezesAvailable, 0),
      ),
    },
    totalSessions: Math.floor(finiteNumber(value.totalSessions, 0)),
    activeCosmetics,
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt : "",
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

export function xpForSession(results: SessionResult[]): number {
  if (results.length === 0) return 0;
  const retrySuccesses = results.filter(
    (result) => result.status === "Good",
  ).length;
  return (
    XP_REWARDS.sessionComplete +
    results.length * XP_REWARDS.itemComplete +
    retrySuccesses * XP_REWARDS.retrySuccess
  );
}

export function levelFromXp(xp: number): number {
  const safeXp = Math.max(0, Number.isFinite(xp) ? xp : 0);
  let level = 1;
  for (
    let index = 1;
    index < LEVEL_THRESHOLDS.length;
    index += 1
  ) {
    if (safeXp < LEVEL_THRESHOLDS[index]) break;
    level = index + 1;
  }
  return level;
}

export type LevelProgress = {
  level: number;
  xp: number;
  currentThreshold: number;
  nextThreshold: number | null;
  xpIntoLevel: number;
  xpNeeded: number;
  percent: number;
};

export function levelProgress(xp: number): LevelProgress {
  const safeXp = Math.max(0, Number.isFinite(xp) ? xp : 0);
  const level = levelFromXp(safeXp);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1];
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? null;

  if (nextThreshold === null) {
    return {
      level,
      xp: safeXp,
      currentThreshold,
      nextThreshold,
      xpIntoLevel: safeXp - currentThreshold,
      xpNeeded: 0,
      percent: 100,
    };
  }

  const xpIntoLevel = safeXp - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;
  return {
    level,
    xp: safeXp,
    currentThreshold,
    nextThreshold,
    xpIntoLevel,
    xpNeeded,
    percent: Math.min(
      100,
      Math.max(0, Math.round((xpIntoLevel / xpNeeded) * 100)),
    ),
  };
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
    freezesAvailable: prev.freezesAvailable,
  };
}

// 세션 결과를 이전 상태에 반영한 새 상태를 계산(순수). 별은 매 세션 누적, 스트릭은 하루 1회.
export function applySessionToState(
  prev: GamificationState,
  results: SessionResult[],
  todayKstDate: string,
  nowIso: string,
  xpDelta = 0,
): GamificationState {
  const xp = prev.xp + Math.max(0, xpDelta);
  return {
    ...prev,
    stars: prev.stars + starsForSession(results),
    xp,
    level: levelFromXp(xp),
    streak: nextStreak(prev.streak, todayKstDate),
    totalSessions: prev.totalSessions + 1,
    updatedAt: nowIso,
  };
}
