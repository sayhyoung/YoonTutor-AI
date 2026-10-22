// 교사 "회원 오답 현황": 학생이 전화관리 앱에서 실제로 풀어 본 표현만 모은다.
// study-api 오답 전체가 아니라 저장된 통화 결과(callReports)가 기준이라, 화면 수치가 학생이 한 것과 일치한다.

import type { CallReportTarget, StoredCallReport } from "./report-schema";

export type PracticedExpression = {
  answerEn: string;
  promptKo: string;
  sourceType: "word" | "sentence";
  // 가장 최근 통화에서의 결과. retry=틀림, skipped=대답하지 못하고 넘어감.
  outcome: CallReportTarget["outcome"];
  learnerAnswer?: string;
  lastPracticedAt: string;
  times: number;
};

// 통화 한 번의 결과. 정답률은 낸 표현 중 한 번에 맞힌 비율(넘긴 표현은 틀린 것으로 센다).
export type CallSession = {
  reportId: string;
  endedAt: string;
  finishReason: StoredCallReport["finishReason"];
  score: number;
  correct: number;
  total: number;
  conversationTurns: number;
  targets: {
    answerEn: string;
    promptKo: string;
    sourceType: "word" | "sentence";
    outcome: CallReportTarget["outcome"];
    learnerAnswer?: string;
  }[];
};

export type PracticeSummary = {
  calls: number;
  practiced: number;
  wrong: number;
  skipped: number;
  words: number;
  sentences: number;
  items: PracticedExpression[];
  // 최근 통화부터.
  sessions: CallSession[];
};

function sourceTypeOf(target: CallReportTarget): "word" | "sentence" {
  return target.sourceLabel.includes("단어") ? "word" : "sentence";
}

function expressionKey(answerEn: string): string {
  return answerEn.toLowerCase().replace(/[.?!,]/g, "").replace(/\s+/g, " ").trim();
}

export function summarizePractice(reports: StoredCallReport[]): PracticeSummary {
  const byExpression = new Map<string, PracticedExpression>();
  const latestFirst = [...reports].sort((a, b) => b.endedAt.localeCompare(a.endedAt));

  for (const report of latestFirst) {
    for (const target of report.targets) {
      const key = expressionKey(target.answerEn);
      const seen = byExpression.get(key);
      if (seen) {
        seen.times += 1;
        continue;
      }
      byExpression.set(key, {
        answerEn: target.answerEn,
        promptKo: target.promptKo,
        sourceType: sourceTypeOf(target),
        outcome: target.outcome,
        ...(target.learnerAnswer ? { learnerAnswer: target.learnerAnswer } : {}),
        lastPracticedAt: report.endedAt,
        times: 1,
      });
    }
  }

  const items = [...byExpression.values()];
  return {
    calls: reports.length,
    practiced: items.length,
    wrong: items.filter((item) => item.outcome === "retry").length,
    skipped: items.filter((item) => item.outcome === "skipped").length,
    words: items.filter((item) => item.sourceType === "word").length,
    sentences: items.filter((item) => item.sourceType === "sentence").length,
    items,
    sessions: latestFirst.map((report) => {
      const correct = report.targets.filter((target) => target.outcome === "correct").length;
      const total = report.targets.length;
      return {
        reportId: report.reportId,
        endedAt: report.endedAt,
        finishReason: report.finishReason,
        score: total > 0 ? Math.round((correct / total) * 100) : 0,
        correct,
        total,
        conversationTurns: report.conversation.length,
        targets: report.targets.map((target) => ({
          answerEn: target.answerEn,
          promptKo: target.promptKo,
          sourceType: sourceTypeOf(target),
          outcome: target.outcome,
          ...(target.learnerAnswer ? { learnerAnswer: target.learnerAnswer } : {}),
        })),
      };
    }),
  };
}
