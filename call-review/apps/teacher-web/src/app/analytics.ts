// 학생 한 명의 통화 기록으로 리포트 지표를 계산한다(화면 전용, 서버 응답을 가공만 함).

import type { CallOutcome, CallReportSummary, FinishReason } from "./types";

export type TrendPoint = { label: string; accuracy: number | null; endedAt: string };
export type MissedRow = { answerEn: string; promptKo: string; misses: number; lastAnswer?: string; lastAt: string };
export type SourceRow = { label: string; counts: Record<CallOutcome, number> };

export type StudentAnalytics = {
  calls: number;
  completionRate: number | null;
  accuracy: number | null;
  reviewed: number;
  outcomeTotals: Record<CallOutcome, number>;
  finishTotals: Record<FinishReason, number>;
  bySource: SourceRow[];
  trend: TrendPoint[];
  missed: MissedRow[];
  avgTurns: number | null;
  firstAt: string | null;
  lastAt: string | null;
};

const emptyOutcomes = (): Record<CallOutcome, number> => ({ correct: 0, retry: 0, skipped: 0 });

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function analyzeReports(reports: CallReportSummary[]): StudentAnalytics {
  const ordered = [...reports].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const outcomeTotals = emptyOutcomes();
  const finishTotals: Record<FinishReason, number> = { completed: 0, stopped: 0, "no-response": 0 };
  const sources = new Map<string, Record<CallOutcome, number>>();
  const missed = new Map<string, MissedRow>();
  let turns = 0;

  const trend: TrendPoint[] = ordered.map((report) => {
    finishTotals[report.finishReason] += 1;
    turns += report.conversation.length;
    let correct = 0;
    let judged = 0;
    for (const target of report.targets) {
      outcomeTotals[target.outcome] += 1;
      const label = target.sourceLabel.replace(" 복습", "");
      const row = sources.get(label) ?? emptyOutcomes();
      row[target.outcome] += 1;
      sources.set(label, row);
      if (target.outcome !== "skipped") judged += 1;
      if (target.outcome === "correct") correct += 1;
      if (target.outcome === "retry") {
        const key = target.answerEn.toLowerCase().replace(/[.?!,]/g, "").trim();
        const current = missed.get(key);
        missed.set(key, {
          answerEn: target.answerEn,
          promptKo: target.promptKo,
          misses: (current?.misses ?? 0) + 1,
          lastAnswer: target.learnerAnswer ?? current?.lastAnswer,
          lastAt: report.endedAt,
        });
      }
    }
    const date = new Date(report.endedAt);
    return { label: `${date.getMonth() + 1}/${date.getDate()}`, accuracy: percent(correct, judged), endedAt: report.endedAt };
  });

  const judgedTotal = outcomeTotals.correct + outcomeTotals.retry;
  return {
    calls: reports.length,
    completionRate: percent(finishTotals.completed, reports.length),
    accuracy: percent(outcomeTotals.correct, judgedTotal),
    reviewed: judgedTotal,
    outcomeTotals,
    finishTotals,
    bySource: [...sources.entries()].map(([label, counts]) => ({ label, counts })),
    trend,
    missed: [...missed.values()].sort((a, b) => b.misses - a.misses || b.lastAt.localeCompare(a.lastAt)),
    avgTurns: reports.length > 0 ? Math.round((turns / reports.length) * 10) / 10 : null,
    firstAt: ordered[0]?.endedAt ?? null,
    lastAt: ordered.at(-1)?.endedAt ?? null,
  };
}

// 교사용 한 줄 총평(결정론적). 숫자를 문장으로 풀어 다음 행동을 제안한다.
export function coachSummary(name: string, analytics: StudentAnalytics): string {
  if (analytics.calls === 0) return `${name} 학생은 아직 관리 전화 기록이 없어요. 첫 통화가 끝나면 결과가 쌓여요.`;
  const parts: string[] = [];
  parts.push(`${name} 학생은 지금까지 관리 전화 ${analytics.calls}회를 진행했어요.`);
  if (analytics.accuracy !== null) {
    parts.push(
      analytics.accuracy >= 80
        ? `복습 표현을 ${analytics.accuracy}% 정확하게 말해 안정적이에요.`
        : analytics.accuracy >= 50
          ? `복습 정답률은 ${analytics.accuracy}%로, 헷갈리는 표현을 한 번 더 짚어 주면 좋아요.`
          : `복습 정답률이 ${analytics.accuracy}%라 다음 수업에서 표현을 함께 다시 확인해 주세요.`,
    );
  }
  if (analytics.finishTotals["no-response"] > 0) {
    parts.push(`응답 없이 끝난 통화가 ${analytics.finishTotals["no-response"]}회 있어 통화 시간 조정을 검토해 보세요.`);
  }
  if (analytics.missed[0]) parts.push(`가장 자주 다시 본 표현은 “${analytics.missed[0].answerEn}”이에요.`);
  return parts.join(" ");
}
