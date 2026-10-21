// 교사 대시보드 행: 담당 학생 + 최근 통화 결과 요약.

import type { TeacherStudent } from "../study-api/teacher-service";
import { type CallReportSummary, type StoredCallReport, toSummary } from "./report-schema";

export type TeacherCallStatus = "완료" | "재통화 필요" | "기록 없음";

export type TeacherStudentRow = {
  customerNo: string;
  customerName: string;
  schoolYear?: number;
  bmNames: string[];
  usingPerfectCare?: boolean;
  status: TeacherCallStatus;
  callCount: number;
  lastCall: CallReportSummary | null;
};

// 마지막 통화가 무응답으로 끝났으면 다시 걸어야 하고, 그 외 종료는 완료로 본다.
export function statusOf(lastCall: Pick<CallReportSummary, "finishReason"> | null): TeacherCallStatus {
  if (!lastCall) return "기록 없음";
  return lastCall.finishReason === "no-response" ? "재통화 필요" : "완료";
}

export function buildTeacherRows(
  students: TeacherStudent[],
  reports: StoredCallReport[],
): TeacherStudentRow[] {
  const byStudent = new Map<string, StoredCallReport[]>();
  for (const report of reports) {
    const list = byStudent.get(report.studentId) ?? [];
    list.push(report);
    byStudent.set(report.studentId, list);
  }

  return students.map((student) => {
    const own = (byStudent.get(student.customerNo) ?? []).sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    const lastCall = own[0] ? toSummary(own[0]) : null;
    return {
      customerNo: student.customerNo,
      customerName: student.customerName,
      ...(student.schoolYear !== undefined ? { schoolYear: student.schoolYear } : {}),
      bmNames: student.bmNames,
      ...(student.usingPerfectCare !== undefined ? { usingPerfectCare: student.usingPerfectCare } : {}),
      status: statusOf(lastCall),
      callCount: own.length,
      lastCall,
    };
  });
}

// 반 전체 현황: 최근 N일 일별 통화 수(종료 유형별), 표현 결과 합계, 많이 틀린 표현.
export type DailyCalls = { date: string; completed: number; stopped: number; noResponse: number };
export type MissedExpression = { answerEn: string; promptKo: string; misses: number; students: number };
export type ClassStats = {
  days: number;
  dailyCalls: DailyCalls[];
  outcomeTotals: { correct: number; retry: number; skipped: number };
  topMissed: MissedExpression[];
  totalCalls: number;
};

function localDateKey(date: Date, timeZone = "Asia/Seoul"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function buildClassStats(reports: StoredCallReport[], now = new Date(), days = 14): ClassStats {
  const dailyCalls: DailyCalls[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getTime() - (days - 1 - index) * 24 * 60 * 60 * 1000);
    return { date: localDateKey(date), completed: 0, stopped: 0, noResponse: 0 };
  });
  const byDate = new Map(dailyCalls.map((day) => [day.date, day]));
  const outcomeTotals = { correct: 0, retry: 0, skipped: 0 };
  const missed = new Map<string, MissedExpression & { studentIds: Set<string> }>();

  for (const report of reports) {
    const day = byDate.get(localDateKey(new Date(report.endedAt)));
    if (day) {
      if (report.finishReason === "completed") day.completed += 1;
      else if (report.finishReason === "stopped") day.stopped += 1;
      else day.noResponse += 1;
    }
    for (const target of report.targets) {
      outcomeTotals[target.outcome] += 1;
      if (target.outcome !== "retry") continue;
      const key = target.answerEn.toLowerCase().replace(/[.?!,]/g, "").trim();
      const entry = missed.get(key) ?? {
        answerEn: target.answerEn,
        promptKo: target.promptKo,
        misses: 0,
        students: 0,
        studentIds: new Set<string>(),
      };
      entry.misses += 1;
      entry.studentIds.add(report.studentId);
      missed.set(key, entry);
    }
  }

  const topMissed = [...missed.values()]
    .sort((a, b) => b.studentIds.size - a.studentIds.size || b.misses - a.misses)
    .slice(0, 5)
    .map(({ studentIds, ...rest }) => ({ ...rest, students: studentIds.size }));

  return { days, dailyCalls, outcomeTotals, topMissed, totalCalls: reports.length };
}
