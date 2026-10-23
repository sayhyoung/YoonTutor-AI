import type {
  CallHistoryEntry,
  CallPlan,
  CallReport,
  LearningHistoryItem,
  TeacherScheduleSettings,
} from "@yoon-call/shared";
import { buildCallPlanFromLearningItems, buildTemplateFreeTalk, kstToIso } from "@yoon-call/shared";

import {
  type ApiLearningItem,
  type ApiSchedule,
  type CallReportPayload,
  type FreeTalkTurnRequest,
  type GeneratedTurn,
  type CallReportSummary,
  UnauthorizedError,
  fetchCallReports,
  fetchLearningItems,
  fetchSchedule,
  generateFreeTalkTurn,
  registerPushDevice,
  transcribeAnswer,
  ttsSource,
  saveCallReport,
} from "./callReviewApi";
import {
  previewHistory,
  previewPlan,
  previewReport,
  previewSchedule,
} from "./mock";

export type CallReviewSnapshot = {
  plan: CallPlan;
  report: CallReport;
  // 교사가 아직 일정을 정하지 않았거나 쉬는 중이면 null.
  schedule: TeacherScheduleSettings | null;
  history: CallHistoryEntry[];
  // 기기 알림 예약용 원본 일정(프리뷰는 없음).
  callSchedule?: ApiSchedule | null;
};

export interface CallReviewRepository {
  load(): Promise<CallReviewSnapshot>;
  // 프리뷰 저장소는 저장·AI 질문·음성 인식을 하지 않는다(템플릿과 가짜 인식 결과 사용).
  // 저장한 통화 요약을 돌려준다(서버가 만든 짧은 대화 피드백 포함).
  saveReport?(report: CallReportPayload): Promise<CallReportSummary>;
  generateTurn?(request: FreeTalkTurnRequest): Promise<GeneratedTurn | null>;
  transcribe?(uri: string): Promise<string>;
  // 서버 푸시 기기 등록. 등록되면 true(기기 자체 알림 대신 서버가 보낸다).
  registerPush?(pushToken: string): Promise<boolean>;
  // 서버 읽어 주기(Gemini TTS) 오디오 주소.
  speechSource?(text: string, language: "en" | "ko"): { uri: string; headers: Record<string, string> } | null;
}

const FINISH_LABELS: Record<CallReportPayload["finishReason"], string> = {
  completed: "완료",
  stopped: "직접 종료",
  "no-response": "응답 없음",
};

// 저장된 통화 결과를 마이페이지 "지난 전화관리" 항목으로 바꾼다.
export function toHistoryEntry(report: CallReportSummary): CallHistoryEntry {
  const ended = new Date(report.endedAt);
  const turns = report.conversation.length;
  return {
    id: report.reportId,
    completedAtLabel: `${ended.getMonth() + 1}월 ${ended.getDate()}일`,
    focusLabel: `표현 ${report.reviewedCount}개 복습${turns > 0 ? ` · 대화 ${turns}번` : ""}`,
    resultLabel: FINISH_LABELS[report.finishReason],
    expressions: [`다시 볼 표현 ${report.needsReviewCount}개`],
    report: {
      endedAt: report.endedAt,
      finishReason: report.finishReason,
      reviewedCount: report.reviewedCount,
      targets: report.targets.map((target) => ({
        id: target.targetId,
        sourceLabel: target.sourceLabel,
        promptKo: target.promptKo,
        answerEn: target.answerEn,
        outcome: target.outcome,
        ...(target.learnerAnswer ? { learnerAnswer: target.learnerAnswer } : {}),
      })),
      conversation: report.conversation.filter((turn) => turn.answer.trim()),
      ...(report.talkFeedback ? { talkFeedback: report.talkFeedback } : {}),
    },
  };
}

export const previewCallReviewRepository: CallReviewRepository = {
  async load() {
    return {
      plan: previewPlan,
      report: previewReport,
      schedule: previewSchedule,
      history: previewHistory,
    };
  },
};

// 전화에서는 웹 튜터용 지시문("~을 영어로 써봐") 대신 한국어 뜻을 복습 표현으로 보여준다.
export function toLearningHistoryItems(items: ApiLearningItem[]): LearningHistoryItem[] {
  return items.flatMap((item) => {
    if (item.sourceType !== "word" && item.sourceType !== "sentence") return [];
    const answerEn = item.answerEn.trim();
    if (!answerEn) return [];
    return [
      {
        id: item.id,
        studentId: item.studentId,
        sourceType: item.sourceType,
        sourceLabel: item.sourceType === "word" ? "단어 복습" : "문장 복습",
        promptKo: item.meaningKo?.trim() || item.promptKo,
        answerEn,
        ...(item.unitName ? { lessonLabel: item.unitName } : {}),
        ...(kstToIso(item.wrongAt) ? { studiedAt: kstToIso(item.wrongAt) } : {}),
      },
    ];
  });
}

function toScheduleSettings(schedule: ApiSchedule): TeacherScheduleSettings {
  return {
    studentLabel: "나",
    weekdays: schedule.weekdays,
    time: schedule.time,
    callsPerWeek: schedule.callsPerWeek,
    reminderMinutesBefore: schedule.reminderMinutesBefore,
    managedBy: "teacher",
  };
}

type ApiRepositoryOptions = {
  getToken: () => string | null;
  saveToken: (token: string) => void;
  onUnauthorized: () => void;
};

// 실제 오답으로 통화 계획을 만들고, 교사가 정한 일정과 저장된 통화 결과를 보여준다.
export function createApiCallReviewRepository({
  getToken,
  saveToken,
  onUnauthorized,
}: ApiRepositoryOptions): CallReviewRepository {
  return {
    async load() {
      const token = getToken();
      if (!token) {
        onUnauthorized();
        throw new UnauthorizedError();
      }

      try {
        const response = await fetchLearningItems(token);
        if (response.renewedToken) saveToken(response.renewedToken);

        // 기록·일정 조회 실패가 통화 자체를 막지는 않는다.
        const current = getToken() ?? token;
        const [reports, scheduleResponse] = await Promise.all([
          fetchCallReports(current).catch((error: unknown) => {
            if (error instanceof UnauthorizedError) throw error;
            return { reports: [], configured: false };
          }),
          fetchSchedule(current).catch((error: unknown) => {
            if (error instanceof UnauthorizedError) throw error;
            return { schedule: null };
          }),
        ]);

        // 지난 통화에서 틀리거나 넘긴 표현을 먼저, 맞힌 표현은 뒤로 보내 문항을 고른다.
        const items = toLearningHistoryItems(response.items);
        const draft = buildCallPlanFromLearningItems({
          id: `call-${response.studyEndDate}`,
          studentId: items[0]?.studentId ?? "me",
          scheduledAtLabel: "선생님과 약속한 시간",
          items,
          freeTalk: { maxTurns: 1, idleStopSeconds: 20, turns: [] },
          practiced: reports.reports.flatMap((report) =>
            report.targets.map((target) => ({ answerEn: target.answerEn, outcome: target.outcome, practicedAt: report.endedAt })),
          ),
        });
        const plan: CallPlan = { ...draft, freeTalk: buildTemplateFreeTalk(draft.targets) };
        const callSchedule = scheduleResponse.schedule;
        const schedule = callSchedule?.active ? toScheduleSettings(callSchedule) : null;

        return {
          plan: {
            ...plan,
            scheduledAtLabel:
              callSchedule?.nextCallLabel ?? (callSchedule && !callSchedule.active ? "관리 전화 쉬는 중" : "일정 준비 중"),
          },
          report: previewReport,
          schedule,
          history: reports.reports.map(toHistoryEntry),
          callSchedule,
        };
      } catch (error) {
        if (error instanceof UnauthorizedError) onUnauthorized();
        throw error;
      }
    },
    async saveReport(report) {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      return (await saveCallReport(token, report)).report;
    },
    async generateTurn(request) {
      const token = getToken();
      return token ? generateFreeTalkTurn(token, request) : null;
    },
    speechSource(text, language) {
      const token = getToken();
      return token ? ttsSource(token, text, language) : null;
    },
    async registerPush(pushToken) {
      const token = getToken();
      if (!token) return false;
      return registerPushDevice(token, pushToken).catch(() => false);
    },
    async transcribe(uri) {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      return transcribeAnswer(token, uri);
    },
  };
}
