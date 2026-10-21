import type { CallHistoryEntry, PastCallReport } from "@yoon-call/shared";

// 마이페이지 "나의 학습현황". 예전 AI 튜터 학습 리포트(누적 지표 → 코치 한마디 → 성취도 변화 →
// 결과 분포 → 영역별 성취 → 재복습 목록)를 전화관리 기록에 맞게 옮겼다. 점수 대신 복습 정답률을 쓴다.

export type Outcome = PastCallReport["targets"][number]["outcome"];
export type OutcomeCounts = Record<Outcome, number>;

export type LearningStatus = {
  calls: number;
  completedCalls: number;
  averageAccuracy: number | null;
  bestAccuracy: number | null;
  lastCallLabel: string | null;
  // 오늘 포함 연속으로 통화한 날 수(하루라도 건너뛰면 끊김).
  streakDays: number;
  outcomeTotals: OutcomeCounts;
  bySource: { label: string; counts: OutcomeCounts }[];
  // 오래된 순. 판정한 표현이 없는 통화(모두 건너뜀)는 null.
  trend: { label: string; accuracy: number | null }[];
  missed: { answerEn: string; promptKo: string; misses: number; lastAnswer?: string }[];
  conversationReplies: number;
  // 통화 중 "못 했어요"(대답하지 못하고 넘어간) 표현. 다시 볼 표현(틀림)과 따로 모은다.
  skipped: { answerEn: string; promptKo: string; times: number }[];
};

const emptyCounts = (): OutcomeCounts => ({ correct: 0, retry: 0, skipped: 0 });

function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function kstDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

function streakDays(endedAts: string[], now: Date): number {
  const days = new Set(endedAts.map(kstDateKey));
  const dayKey = (offset: number) => kstDateKey(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000).toISOString());
  // 오늘 아직 통화 전이면 어제부터 센다.
  let offset = days.has(dayKey(0)) ? 0 : 1;
  let streak = 0;
  while (days.has(dayKey(offset))) {
    streak += 1;
    offset += 1;
  }
  return streak;
}

export function analyzeLearning(history: CallHistoryEntry[], now = new Date()): LearningStatus {
  const reports = history.flatMap((entry) => (entry.report ? [entry.report] : []));
  const ordered = [...reports].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const outcomeTotals = emptyCounts();
  const sources = new Map<string, OutcomeCounts>();
  const missed = new Map<string, LearningStatus["missed"][number]>();
  const skipped = new Map<string, LearningStatus["skipped"][number]>();
  let conversationReplies = 0;
  let previousDay = "";

  const trend = ordered.map((report) => {
    let correct = 0;
    let judged = 0;
    conversationReplies += report.conversation.length;
    for (const target of report.targets) {
      outcomeTotals[target.outcome] += 1;
      const label = target.sourceLabel.replace(" 복습", "");
      const counts = sources.get(label) ?? emptyCounts();
      counts[target.outcome] += 1;
      sources.set(label, counts);
      if (target.outcome !== "skipped") judged += 1;
      if (target.outcome === "correct") correct += 1;
      if (target.outcome === "skipped") {
        const key = target.answerEn.toLowerCase().replace(/[.?!,]/g, "").trim();
        const current = skipped.get(key);
        skipped.set(key, { answerEn: target.answerEn, promptKo: target.promptKo, times: (current?.times ?? 0) + 1 });
      }
      if (target.outcome === "retry") {
        const key = target.answerEn.toLowerCase().replace(/[.?!,]/g, "").trim();
        const current = missed.get(key);
        missed.set(key, {
          answerEn: target.answerEn,
          promptKo: target.promptKo,
          misses: (current?.misses ?? 0) + 1,
          lastAnswer: target.learnerAnswer ?? current?.lastAnswer,
        });
      }
    }
    const date = new Date(report.endedAt);
    // 같은 날 여러 번 통화하면 두 번째부터는 시각으로 구분한다(예: 10/21, 16:05).
    const day = `${date.getMonth() + 1}/${date.getDate()}`;
    const label = day === previousDay ? `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}` : day;
    previousDay = day;
    return { label, accuracy: percent(correct, judged) };
  });

  const accuracies = trend.flatMap((point) => (point.accuracy === null ? [] : [point.accuracy]));
  const last = ordered.at(-1);
  return {
    calls: reports.length,
    completedCalls: reports.filter((report) => report.finishReason === "completed").length,
    averageAccuracy: accuracies.length > 0 ? Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length) : null,
    bestAccuracy: accuracies.length > 0 ? Math.max(...accuracies) : null,
    lastCallLabel: last ? `${new Date(last.endedAt).getMonth() + 1}월 ${new Date(last.endedAt).getDate()}일` : null,
    streakDays: streakDays(reports.map((report) => report.endedAt), now),
    outcomeTotals,
    bySource: [...sources.entries()].map(([label, counts]) => ({ label, counts })),
    trend,
    missed: [...missed.values()].sort((a, b) => b.misses - a.misses),
    conversationReplies,
    skipped: [...skipped.values()].sort((a, b) => b.times - a.times),
  };
}

// 베플리 선생님 한마디(학생용, 결정론적). 잘한 점 → 다음에 할 일 순서로 말한다.
export function beflyComment(status: LearningStatus): string {
  if (status.calls === 0) return "아직 함께 통화한 기록이 없어요. 첫 통화를 마치면 여기에서 실력이 자라는 걸 볼 수 있어요.";
  const parts: string[] = [];
  const recent = status.trend.slice(-3).flatMap((point) => (point.accuracy === null ? [] : [point.accuracy]));
  const earlier = status.trend.slice(0, -3).flatMap((point) => (point.accuracy === null ? [] : [point.accuracy]));
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  if (status.streakDays >= 2) parts.push(`${status.streakDays}일 연속으로 통화했어요! 꾸준함이 최고예요.`);
  else parts.push(`지금까지 ${status.calls}번 통화했어요.`);

  if (recent.length > 0 && earlier.length > 0 && average(recent) - average(earlier) >= 10) {
    parts.push("요즘 정답률이 쑥쑥 오르고 있어요.");
  } else if (status.averageAccuracy !== null && status.averageAccuracy >= 80) {
    parts.push(`복습 표현을 ${status.averageAccuracy}%나 정확하게 말했어요.`);
  } else if (status.averageAccuracy !== null) {
    parts.push("헷갈린 표현은 다음 통화에서 한 번 더 말해 보면 금방 익숙해져요.");
  }

  if (status.missed[0]) parts.push(`“${status.missed[0].answerEn}” 표현을 한 번 더 연습해 볼까요?`);
  return parts.join(" ");
}
