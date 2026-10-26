// BFF /api/call-review/teacher/* 응답 형식(web/src/lib/call-review/*와 맞춘다).

// correct: 한 번에 맞힘 / hinted: 힌트 받고 맞힘 / retry: 끝내 못 맞힘 / skipped: 넘김.
export type CallOutcome = "correct" | "hinted" | "retry" | "skipped";
export type FinishReason = "completed" | "stopped" | "no-response";
export type TeacherCallStatus = "완료" | "재통화 필요" | "부재중" | "기록 없음";

export const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type ScheduleView = {
  weekdays: Weekday[];
  time: string;
  reminderMinutesBefore: number;
  active: boolean;
  callsPerWeek: number;
  updatedAt: string;
  updatedByName: string | null;
  nextCallAt: string | null;
  nextCallLabel: string | null;
};

export type CallReportSummary = {
  reportId: string;
  startedAt: string;
  endedAt: string;
  finishReason: FinishReason;
  targets: {
    targetId: string;
    sourceLabel: string;
    promptKo: string;
    answerEn: string;
    outcome: CallOutcome;
    learnerAnswer?: string;
    // 이 표현에서 학생이 말한 답(순서대로). 한 번에 맞혔으면 없음.
    attempts?: string[];
  }[];
  conversation: { questionEn: string; answer: string }[];
  // 짧은 대화 뒤 학생에게 남긴 피드백(학생 앱에도 같은 글이 보인다).
  talkFeedback?: string;
  reviewedCount: number;
  needsReviewCount: number;
  savedAt: string;
};

// 교사가 보낸 메시지와 학습자의 읽음·반응(BFF messages.ts TeacherMessageView).
export type MessageReaction = "thanks" | "check" | "love" | "cheer";

export type TeacherMessage = {
  id: string;
  teacherName: string | null;
  body: string;
  sentAt: string;
  readAt?: string;
  reaction?: MessageReaction;
  reactedAt?: string;
};

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

export type TeacherStudentsResponse = {
  teacher: { displayName: string | null };
  students: TeacherStudentRow[];
  reportsConfigured: boolean;
  reportsError: boolean;
  classStats: ClassStats;
};

export type DailyCalls = { date: string; completed: number; stopped: number; noResponse: number };

export type ClassStats = {
  days: number;
  dailyCalls: DailyCalls[];
  outcomeTotals: Record<CallOutcome, number>;
  topMissed: { answerEn: string; promptKo: string; misses: number; students: number }[];
  totalCalls: number;
};

export type UpcomingItems = {
  studyStartDate: string;
  studyEndDate: string;
  total: number;
  items: {
    id: string;
    sourceType: "word" | "sentence" | "assessment";
    answerEn: string;
    meaningKo: string | null;
    unitName: string;
    wrongAt: string;
  }[];
};

export type StudentReportResponse = {
  student: { customerNo: string; customerName: string; schoolYear?: number; bmNames: string[]; usingPerfectCare?: boolean };
  reports: CallReportSummary[];
  reportsConfigured: boolean;
  upcoming: UpcomingItems | null;
};
