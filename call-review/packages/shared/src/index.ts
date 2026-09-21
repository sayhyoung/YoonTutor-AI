export type CallPhase =
  | "home"
  | "incoming"
  | "connecting"
  | "review"
  | "free-talk"
  | "complete";

export type InputMode = "voice" | "text";

export type LearningTarget = {
  id: string;
  sourceLabel: string;
  promptKo: string;
  answerEn: string;
  hint: string;
};

export type ConversationChoice = {
  id: string;
  answerEn: string;
  meaningKo: string;
};

export type ConversationTurn = {
  id: string;
  relatedExpression: string;
  questionEn: string;
  questionMeaningKo: string;
  answerHint: string;
  previewVoiceAnswer: string;
  choices: ConversationChoice[];
};

export type FreeTalkPlan = {
  maxTurns: number;
  idleStopSeconds: number;
  turns: ConversationTurn[];
};

export type CallPlan = {
  id: string;
  studentId: string;
  title: string;
  scheduledAtLabel: string;
  estimatedMinutes: number;
  targets: LearningTarget[];
  freeTalk: FreeTalkPlan;
};

export type CallReport = {
  callId: string;
  studentId: string;
  completedAtLabel: string;
  reviewedCount: number;
  needsReviewCount: number;
  expressions: string[];
  coachComment: string;
};

export type TeacherCallRow = {
  id: string;
  studentLabel: string;
  status: "예정" | "완료" | "재통화 필요";
  scheduledAtLabel: string;
  focusLabel: string;
  followUpLabel: string;
};

export type CallHistoryEntry = {
  id: string;
  completedAtLabel: string;
  focusLabel: string;
  resultLabel: string;
  expressions: string[];
};

export type TeacherScheduleSettings = {
  studentLabel: string;
  weekdays: string[];
  time: string;
  callsPerWeek: number;
  reminderMinutesBefore: number;
  managedBy: "teacher";
};
