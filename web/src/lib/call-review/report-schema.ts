// 전화관리 통화 결과(CallReport) 저장 형식과 입력 검증.
// 학생 식별정보는 요청 본문이 아니라 서버가 검증한 토큰에서만 채운다.

export type CallFinishReason = "completed" | "stopped" | "no-response";
// correct: 한 번에 맞힘 / hinted: 힌트 받고 맞힘 / retry: 끝내 못 맞힘 / skipped: 넘김.
export type CallTargetOutcome = "correct" | "hinted" | "retry" | "skipped";

export type CallReportTarget = {
  targetId: string;
  sourceLabel: string;
  promptKo: string;
  answerEn: string;
  outcome: CallTargetOutcome;
  // 학생의 첫 답(한 번에 맞혔으면 없음).
  learnerAnswer?: string;
  // 이 표현에서 학생이 말한 답을 순서대로(최대 MAX_ATTEMPTS개). 한 번에 맞혔으면 없음.
  attempts?: string[];
};

export type CallReportTurn = {
  questionEn: string;
  answer: string;
};

// 앱이 보내는 값. reportId는 재전송 시 중복 저장을 막는 멱등 키다.
export type CallReportInput = {
  reportId: string;
  startedAt: string;
  endedAt: string;
  finishReason: CallFinishReason;
  targets: CallReportTarget[];
  conversation: CallReportTurn[];
};

export type StoredCallReport = CallReportInput & {
  schemaVersion: 1;
  studentId: string;
  studentName: string | null;
  reviewedCount: number;
  needsReviewCount: number;
  savedAt: string;
  // 짧은 대화가 끝난 뒤 AI가 남긴 한국어 피드백(학생 앱·교사 리포트에 같이 보여 준다). 만들지 못하면 없음.
  talkFeedback?: string;
};

const MAX_TARGETS = 10;
const MAX_TURNS = 5;
const MAX_TEXT = 300;
const REPORT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const REASONS: CallFinishReason[] = ["completed", "stopped", "no-response"];
const OUTCOMES: CallTargetOutcome[] = ["correct", "hinted", "retry", "skipped"];
const MAX_ATTEMPTS = 3;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function parseCallReportInput(
  value: unknown,
): { ok: true; input: CallReportInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "잘못된 요청이에요." };
  const body = value as Record<string, unknown>;

  const reportId = typeof body.reportId === "string" && REPORT_ID.test(body.reportId) ? body.reportId : null;
  if (!reportId) return { ok: false, error: "reportId가 올바르지 않아요." };

  const startedAt = isoDate(body.startedAt);
  const endedAt = isoDate(body.endedAt);
  if (!startedAt || !endedAt || startedAt > endedAt) {
    return { ok: false, error: "통화 시각이 올바르지 않아요." };
  }

  const finishReason = REASONS.find((reason) => reason === body.finishReason);
  if (!finishReason) return { ok: false, error: "종료 사유가 올바르지 않아요." };

  if (!Array.isArray(body.targets) || body.targets.length > MAX_TARGETS) {
    return { ok: false, error: "복습 표현 목록이 올바르지 않아요." };
  }
  const targets: CallReportTarget[] = [];
  for (const raw of body.targets as unknown[]) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const targetId = text(item.targetId, 120);
    const sourceLabel = text(item.sourceLabel, 40);
    const promptKo = text(item.promptKo);
    const answerEn = text(item.answerEn);
    const outcome = OUTCOMES.find((candidate) => candidate === item.outcome);
    if (!targetId || !sourceLabel || !promptKo || !answerEn || !outcome) {
      return { ok: false, error: "복습 표현 항목이 올바르지 않아요." };
    }
    const learnerAnswer = text(item.learnerAnswer);
    if (item.attempts !== undefined && (!Array.isArray(item.attempts) || item.attempts.length > MAX_ATTEMPTS)) {
      return { ok: false, error: "복습 표현 항목이 올바르지 않아요." };
    }
    const attempts = ((item.attempts as unknown[] | undefined) ?? []).map((value) => text(value));
    if (attempts.some((value) => value === null)) return { ok: false, error: "복습 표현 항목이 올바르지 않아요." };
    targets.push({
      targetId,
      sourceLabel,
      promptKo,
      answerEn,
      outcome,
      ...(learnerAnswer ? { learnerAnswer } : {}),
      ...(attempts.length > 0 ? { attempts: attempts as string[] } : {}),
    });
  }

  if (!Array.isArray(body.conversation) || body.conversation.length > MAX_TURNS) {
    return { ok: false, error: "대화 기록이 올바르지 않아요." };
  }
  const conversation: CallReportTurn[] = [];
  for (const raw of body.conversation as unknown[]) {
    const turn = (raw ?? {}) as Record<string, unknown>;
    const questionEn = text(turn.questionEn);
    const answer = text(turn.answer);
    if (!questionEn || !answer) return { ok: false, error: "대화 기록 항목이 올바르지 않아요." };
    conversation.push({ questionEn, answer });
  }

  return { ok: true, input: { reportId, startedAt, endedAt, finishReason, targets, conversation } };
}

export function toStoredCallReport(
  input: CallReportInput,
  student: { studentId: string; studentName?: string | null },
  savedAt = new Date(),
): StoredCallReport {
  return {
    ...input,
    schemaVersion: 1,
    studentId: student.studentId,
    studentName: student.studentName ?? null,
    reviewedCount: input.targets.filter((target) => target.outcome !== "skipped").length,
    needsReviewCount: input.targets.filter((target) => target.outcome === "retry").length,
    savedAt: savedAt.toISOString(),
  };
}

// 학생 앱 마이페이지용 요약(학생 번호 등 내부 식별정보 제외).
export type CallReportSummary = Omit<StoredCallReport, "studentId" | "studentName" | "schemaVersion">;

export function toSummary(report: StoredCallReport): CallReportSummary {
  return {
    reportId: report.reportId,
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    finishReason: report.finishReason,
    targets: report.targets,
    conversation: report.conversation,
    reviewedCount: report.reviewedCount,
    needsReviewCount: report.needsReviewCount,
    savedAt: report.savedAt,
    ...(report.talkFeedback ? { talkFeedback: report.talkFeedback } : {}),
  };
}
