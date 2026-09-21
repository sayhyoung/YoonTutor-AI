export type CallPhase =
  | "home"
  | "incoming"
  | "connecting"
  | "review"
  | "free-talk"
  | "complete";

export type InputMode = "voice" | "text";

export type LearningSourceType = "word" | "sentence" | "assessment";

export type LearningHistoryItem = {
  id: string;
  studentId: string;
  sourceType: LearningSourceType;
  sourceLabel: string;
  promptKo: string;
  answerEn: string;
  hint?: string;
};

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

export type BuildCallPlanInput = {
  id: string;
  studentId: string;
  scheduledAtLabel: string;
  items: LearningHistoryItem[];
  freeTalk: FreeTalkPlan;
  estimatedMinutes?: number;
  maxTargets?: number;
};

const SOURCE_PRIORITY: LearningSourceType[] = [
  "word",
  "sentence",
  "assessment",
];

function defaultHint(sourceType: LearningSourceType): string {
  if (sourceType === "word") {
    return "첫소리를 떠올리며 영어 단어로 말해봐.";
  }
  if (sourceType === "sentence") {
    return "핵심 동사와 시제를 먼저 확인해봐.";
  }
  return "문장의 뜻을 먼저 정리하고 영어로 말해봐.";
}

export function buildCallPlanFromLearningItems({
  id,
  studentId,
  scheduledAtLabel,
  items,
  freeTalk,
  estimatedMinutes = 5,
  maxTargets = 3,
}: BuildCallPlanInput): CallPlan {
  const selected: LearningHistoryItem[] = [];
  const selectedIds = new Set<string>();

  for (const sourceType of SOURCE_PRIORITY) {
    const item = items.find(
      (candidate) =>
        candidate.sourceType === sourceType && !selectedIds.has(candidate.id),
    );
    if (item && selected.length < maxTargets) {
      selected.push(item);
      selectedIds.add(item.id);
    }
  }

  for (const item of items) {
    if (selected.length >= maxTargets) break;
    if (!selectedIds.has(item.id)) {
      selected.push(item);
      selectedIds.add(item.id);
    }
  }

  return {
    id,
    studentId,
    title: "오늘의 5분 관리 전화",
    scheduledAtLabel,
    estimatedMinutes,
    targets: selected.map((item) => ({
      id: item.id,
      sourceLabel: item.sourceLabel,
      promptKo: item.promptKo,
      answerEn: item.answerEn,
      hint: item.hint ?? defaultHint(item.sourceType),
    })),
    freeTalk,
  };
}

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
