// BFF /api/call-review/teacher/* 응답 형식(web/src/lib/call-review/*와 맞춘다).

export type CallOutcome = "correct" | "retry" | "skipped";
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
  }[];
  conversation: { questionEn: string; answer: string }[];
  // 짧은 대화 뒤 학생에게 남긴 피드백(학생 앱에도 같은 글이 보인다).
  talkFeedback?: string;
  reviewedCount: number;
  needsReviewCount: number;
  savedAt: string;
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
