import type {
  CallHistoryEntry,
  CallPlan,
  CallReport,
  DiaryEntry,
  LearningHistoryItem,
  TeacherScheduleSettings,
} from "@yoon-call/shared";
import {
  addDiaryTarget,
  buildCallPlanFromLearningItems,
  buildTemplateFreeTalk,
  kstToIso,
  pickDiaryForCall,
} from "@yoon-call/shared";

import {
  type AnswerCheckRequest,
  checkAlternativeAnswer,
  fetchTeacherMessages,
  type MessageUpdate,
  type TeacherMessage,
  updateTeacherMessage,
  type ApiLearningItem,
  type ApiSchedule,
  type CallReportPayload,
  type FreeTalkTurnRequest,
  type GeneratedQuestion,
  type GeneratedSupport,
  type CallReportSummary,
  type DiarySavePayload,
  type DiarySuggestBody,
  type DiarySuggestion,
  fetchDiary,
  readDiaryComment,
  saveDiary,
  suggestDiary,
  UnauthorizedError,
  fetchCallReports,
  fetchLearningItems,
  fetchSchedule,
  generateFreeTalkQuestion,
  generateFreeTalkSupport,
  registerPushDevice,
  transcribeAnswer,
  ttsSource,
  saveCallReport,
} from "./callReviewApi";
import {
  previewDiary,
  previewDiarySuggestions,
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
  // 영어 한 줄 일기(최근순). 최근 일기 한 줄은 통화 문항 맨 뒤에 들어간다.
  diary: DiaryEntry[];
};

export interface CallReviewRepository {
  load(): Promise<CallReviewSnapshot>;
  // 프리뷰 저장소는 저장·AI 질문·음성 인식을 하지 않는다(템플릿과 가짜 인식 결과 사용).
  // 저장한 통화 요약을 돌려준다(서버가 만든 짧은 대화 피드백 포함).
  saveReport?(report: CallReportPayload): Promise<CallReportSummary>;
  generateQuestion?(request: FreeTalkTurnRequest): Promise<GeneratedQuestion | null>;
  generateSupport?(request: FreeTalkTurnRequest & { questionEn: string }): Promise<GeneratedSupport | null>;
  // 선생님 메시지(홈 카드·마이페이지 메시지함)와 읽음·반응.
  loadMessages?(): Promise<TeacherMessage[]>;
  updateMessage?(id: string, update: MessageUpdate): Promise<TeacherMessage>;
  // 규칙상 틀린 복습 답이 뜻으로는 맞는지 서버 AI 판정.
  checkAnswer?(request: AnswerCheckRequest): Promise<boolean>;
  transcribe?(uri: string, language?: "en" | "ko"): Promise<string>;
  // 영어 한 줄 일기: 문장 추천, 오늘 일기 저장, 선생님 댓글 읽음.
  suggestDiary?(body: DiarySuggestBody): Promise<DiarySuggestion[]>;
  saveDiary?(payload: DiarySavePayload): Promise<DiaryEntry>;
  readDiaryComment?(id: string): Promise<DiaryEntry>;
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

// 프리뷰(로그인 없음)에서 화면을 볼 수 있는 예시 메시지. 반응은 이번 실행 동안만 기억한다.
let previewMessages: TeacherMessage[] = [
  {
    id: "preview-message-1",
    teacherName: "김윤",
    body: "오늘 통화 정말 잘했어요! 헷갈린 표현은 다음 통화에서 한 번 더 연습해 봐요.",
    sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
];

// 프리뷰 일기장. 저장·댓글 읽음은 이번 실행 동안만 기억한다.
let previewDiaryEntries: DiaryEntry[] = previewDiary;

function previewToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const previewCallReviewRepository: CallReviewRepository = {
  async load() {
    const targets = addDiaryTarget(previewPlan.targets, pickDiaryForCall(previewDiaryEntries));
    return {
      plan: { ...previewPlan, targets, freeTalk: buildTemplateFreeTalk(targets) },
      report: previewReport,
      schedule: previewSchedule,
      history: previewHistory,
      diary: previewDiaryEntries,
    };
  },
  async suggestDiary(body) {
    // 서버 AI 대신 기분·사진 여부로 고른 예시 문장(화면 확인용). 기다리는 화면도 보이게 잠시 쉰다.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return previewDiarySuggestions(body.mood ?? null, Boolean(body.photo), body.noteKo ?? null);
  },
  async saveDiary(payload) {
    const date = previewToday();
    const now = new Date().toISOString();
    const previous = previewDiaryEntries.find((entry) => entry.id === date);
    const entry: DiaryEntry = { id: date, date, ...payload, createdAt: previous?.createdAt ?? now, updatedAt: now };
    previewDiaryEntries = [entry, ...previewDiaryEntries.filter((item) => item.id !== date)];
    return entry;
  },
  async readDiaryComment(id) {
    const now = new Date().toISOString();
    previewDiaryEntries = previewDiaryEntries.map((entry) =>
      entry.id === id && entry.teacherComment && !entry.commentReadAt ? { ...entry, commentReadAt: now } : entry,
    );
    return previewDiaryEntries.find((entry) => entry.id === id)!;
  },
  async loadMessages() {
    return previewMessages;
  },
  async updateMessage(id, update) {
    const now = new Date().toISOString();
    previewMessages = previewMessages.map((message) =>
      message.id !== id
        ? message
        : { ...message, readAt: message.readAt ?? now, ...(update.action === "react" ? { reaction: update.reaction, reactedAt: now } : {}) },
    );
    return previewMessages.find((message) => message.id === id)!;
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
        const [reports, scheduleResponse, diary] = await Promise.all([
          fetchCallReports(current).catch((error: unknown) => {
            if (error instanceof UnauthorizedError) throw error;
            return { reports: [], configured: false };
          }),
          fetchSchedule(current).catch((error: unknown) => {
            if (error instanceof UnauthorizedError) throw error;
            return { schedule: null };
          }),
          fetchDiary(current).catch((error: unknown) => {
            if (error instanceof UnauthorizedError) throw error;
            return [] as DiaryEntry[];
          }),
        ]);

        // 지난 통화에서 틀리거나 넘긴 표현을 먼저, 맞힌 표현은 뒤로 보내 문항을 고른다.
        const items = toLearningHistoryItems(response.items);
        const practiced = reports.reports.flatMap((report) =>
          report.targets.map((target) => ({ answerEn: target.answerEn, outcome: target.outcome, practicedAt: report.endedAt })),
        );
        const draft = buildCallPlanFromLearningItems({
          id: `call-${response.studyEndDate}`,
          studentId: items[0]?.studentId ?? "me",
          scheduledAtLabel: "선생님과 약속한 시간",
          items,
          freeTalk: { maxTurns: 1, idleStopSeconds: 20, turns: [] },
          practiced,
        });
        // 최근 쓴 영어 일기 한 줄을 문항 맨 뒤에 넣어 다음 전화에서 다시 말해 본다.
        const targets = addDiaryTarget(draft.targets, pickDiaryForCall(diary, practiced));
        const plan: CallPlan = { ...draft, targets, freeTalk: buildTemplateFreeTalk(targets) };
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
          diary,
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
    async generateQuestion(request) {
      const token = getToken();
      return token ? generateFreeTalkQuestion(token, request) : null;
    },
    async generateSupport(request) {
      const token = getToken();
      return token ? generateFreeTalkSupport(token, request) : null;
    },
    async loadMessages() {
      const token = getToken();
      return token ? fetchTeacherMessages(token) : [];
    },
    async updateMessage(id, update) {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      return updateTeacherMessage(token, id, update);
    },
    async checkAnswer(request) {
      const token = getToken();
      return token ? checkAlternativeAnswer(token, request).catch(() => false) : false;
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
    async transcribe(uri, language) {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      return transcribeAnswer(token, uri, language);
    },
    async suggestDiary(body) {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      return suggestDiary(token, body);
    },
    async saveDiary(payload) {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      return saveDiary(token, payload);
    },
    async readDiaryComment(id) {
      const token = getToken();
      if (!token) throw new UnauthorizedError();
      return readDiaryComment(token, id);
    },
  };
}
