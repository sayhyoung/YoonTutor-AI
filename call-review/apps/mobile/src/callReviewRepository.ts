import type {
  CallHistoryEntry,
  CallPlan,
  CallReport,
  LearningHistoryItem,
  TeacherScheduleSettings,
} from "@yoon-call/shared";
import { buildCallPlanFromLearningItems, buildTemplateFreeTalk } from "@yoon-call/shared";

import {
  type ApiLearningItem,
  type CallReportPayload,
  type CallReportSummary,
  UnauthorizedError,
  fetchCallReports,
  fetchLearningItems,
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
  schedule: TeacherScheduleSettings;
  history: CallHistoryEntry[];
};

export interface CallReviewRepository {
  load(): Promise<CallReviewSnapshot>;
  // 프리뷰 저장소는 저장하지 않는다.
  saveReport?(report: CallReportPayload): Promise<void>;
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
      },
    ];
  });
}

type ApiRepositoryOptions = {
  getToken: () => string | null;
  saveToken: (token: string) => void;
  onUnauthorized: () => void;
};

// 실제 오답으로 통화 계획을 만들고, 저장된 통화 결과를 지난 기록으로 보여준다.
// 일정 API가 생기기 전까지 일정만 샘플을 쓴다.
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

        const items = toLearningHistoryItems(response.items);
        const draft = buildCallPlanFromLearningItems({
          id: `call-${response.studyEndDate}`,
          studentId: items[0]?.studentId ?? "me",
          scheduledAtLabel: "선생님이 정한 시간",
          items,
          freeTalk: { maxTurns: 1, idleStopSeconds: 20, turns: [] },
        });
        const plan: CallPlan = { ...draft, freeTalk: buildTemplateFreeTalk(draft.targets) };

        // 기록 조회 실패가 통화 자체를 막지는 않는다.
        const reports = await fetchCallReports(getToken() ?? token).catch((error: unknown) => {
          if (error instanceof UnauthorizedError) throw error;
          return { reports: [], configured: false };
        });

        return {
          plan,
          report: previewReport,
          schedule: previewSchedule,
          history: reports.reports.map(toHistoryEntry),
        };
      } catch (error) {
        if (error instanceof UnauthorizedError) onUnauthorized();
        throw error;
      }
    },
    async saveReport(report) {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      await saveCallReport(token, report);
    },
  };
}
