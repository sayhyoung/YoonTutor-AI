// 교사 대시보드 행: 담당 학생 + 최근 통화 결과 요약.

import type { TeacherStudent } from "../study-api/teacher-service";
import { type CallReportSummary, type StoredCallReport, toSummary } from "./report-schema";
import { type ScheduleView, type StoredCallSchedule, previousCallAt, toScheduleView } from "./schedule";

export type TeacherCallStatus = "완료" | "재통화 필요" | "부재중" | "기록 없음";

// 예정 시각 뒤 이 시간이 지나도록 통화 기록이 없으면 부재중으로 본다.
const MISSED_GRACE_MS = 60 * 60 * 1000;
// 알림을 받고 조금 일찍 받은 통화도 그 회차로 인정한다.
const EARLY_ANSWER_MS = 30 * 60 * 1000;

export type TeacherStudentRow = {
  customerNo: string;
  customerName: string;
  schoolYear?: number;
  bmNames: string[];
  usingPerfectCare?: boolean;
  status: TeacherCallStatus;
  callCount: number;
  lastCall: CallReportSummary | null;
  schedule: ScheduleView | null;
};

// 가장 최근 예정 회차를 놓쳤는지. 일정을 그 회차 이후에 만들었거나 아직 유예 시간 안이면 아니다.
export function missedLatestCall(
  schedule: StoredCallSchedule | undefined,
  reports: Pick<StoredCallReport, "endedAt">[],
  now: Date,
): boolean {
  if (!schedule?.active) return false;
  const due = previousCallAt(schedule, now);
  if (!due) return false;
  if (now.getTime() - due.getTime() < MISSED_GRACE_MS) return false;
  if (Date.parse(schedule.updatedAt) > due.getTime()) return false;
  return !reports.some((report) => Date.parse(report.endedAt) >= due.getTime() - EARLY_ANSWER_MS);
}

// 마지막 통화가 무응답으로 끝났으면 다시 걸어야 하고, 그 외 종료는 완료로 본다.
export function statusOf(lastCall: Pick<CallReportSummary, "finishReason"> | null): TeacherCallStatus {
  if (!lastCall) return "기록 없음";
  return lastCall.finishReason === "no-response" ? "재통화 필요" : "완료";
}

export function buildTeacherRows(
  students: TeacherStudent[],
  reports: StoredCallReport[],
  schedules: Map<string, StoredCallSchedule> = new Map(),
  now = new Date(),
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
    const schedule = schedules.get(student.customerNo);
    return {
      customerNo: student.customerNo,
      customerName: student.customerName,
      ...(student.schoolYear !== undefined ? { schoolYear: student.schoolYear } : {}),
      bmNames: student.bmNames,
      ...(student.usingPerfectCare !== undefined ? { usingPerfectCare: student.usingPerfectCare } : {}),
      status: missedLatestCall(schedule, own, now) ? "부재중" : statusOf(lastCall),
      callCount: own.length,
      lastCall,
      schedule: schedule ? toScheduleView(schedule, now) : null,
    };
  });
}

// 반 전체 현황: 최근 N일 일별 통화 수(종료 유형별), 표현 결과 합계, 많이 틀린 표현.
export type DailyCalls = { date: string; completed: number; stopped: number; noResponse: number };
export type MissedExpression = { answerEn: string; promptKo: string; misses: number; students: number };
export type ClassStats = {
  days: number;
  dailyCalls: DailyCalls[];
  outcomeTotals: { correct: number; hinted: number; retry: number; skipped: number };
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
  const outcomeTotals = { correct: 0, hinted: 0, retry: 0, skipped: 0 };
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
