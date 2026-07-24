import type { LearningSource, QuizSession } from "./types";

// 데모 세션은 mock 학습 모드에서만 합친다. external-api 사용자의
// 학생 리포트와 교사 집계에는 실제 저장 세션만 노출한다.
export function buildVisibleSessions(
  storedSessions: QuizSession[],
  demoSessions: QuizSession[],
  source: LearningSource,
  limit = 8,
): QuizSession[] {
  const candidates =
    source === "mock"
      ? [...storedSessions, ...demoSessions]
      : [...storedSessions];
  const seen = new Set<string>();

  return candidates
    .filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    })
    .slice(0, limit);
}
