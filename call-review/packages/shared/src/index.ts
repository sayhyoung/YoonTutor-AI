export type CallPhase =
  | "home"
  | "incoming"
  | "connecting"
  | "review"
  | "free-talk"
  | "complete";

export type InputMode = "voice" | "text";

export type LearningSourceType = "word" | "sentence";

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

const SOURCE_PRIORITY: LearningSourceType[] = ["word", "sentence"];

function defaultHint(sourceType: LearningSourceType): string {
  if (sourceType === "word") {
    return "첫소리를 떠올리며 영어 단어로 말해봐.";
  }
  return "핵심 동사와 시제를 먼저 확인해봐.";
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

const IDLE_STOP_SECONDS = 20;

function isWord(answerEn: string): boolean {
  return !answerEn.trim().includes(" ");
}

// AI 질문 생성 전까지 쓰는 결정론적 자유대화 템플릿.
// 복습 표현마다 질문 하나를 만들어, 오늘 표현을 근거로 대화한다는 원칙을 지킨다.
export function buildTemplateFreeTalk(targets: LearningTarget[]): FreeTalkPlan {
  const turns: ConversationTurn[] = targets.map((target, index) => {
    const expression = target.answerEn.trim().replace(/[.!?]+$/, "");
    const id = `talk-${index + 1}`;
    if (isWord(expression)) {
      return {
        id,
        relatedExpression: expression,
        questionEn: `Can you make a short sentence with "${expression}"?`,
        questionMeaningKo: `"${expression}"를 넣어서 짧은 문장을 말해 볼래?`,
        answerHint: `단어 하나만 말해도 괜찮아요. "${expression}"부터 말해 봐요.`,
        previewVoiceAnswer: `I know the word ${expression}.`,
        choices: [
          { id: `${id}-a`, answerEn: `I know the word ${expression}.`, meaningKo: `나는 ${expression}라는 단어를 알아.` },
          { id: `${id}-b`, answerEn: `${expression[0]!.toUpperCase()}${expression.slice(1)}.`, meaningKo: "단어만 말해도 좋아요." },
          { id: `${id}-c`, answerEn: "I'm not sure.", meaningKo: "잘 모르겠어." },
        ],
      };
    }
    return {
      id,
      relatedExpression: expression,
      questionEn: `When can you say "${expression}"?`,
      questionMeaningKo: `"${expression}"는 언제 말할 수 있을까?`,
      answerHint: "I can say it at…로 시작해 봐요.",
      previewVoiceAnswer: "I can say it at school.",
      choices: [
        { id: `${id}-a`, answerEn: "I can say it at school.", meaningKo: "학교에서 말할 수 있어." },
        { id: `${id}-b`, answerEn: "I can say it at home.", meaningKo: "집에서 말할 수 있어." },
        { id: `${id}-c`, answerEn: "I'm not sure.", meaningKo: "잘 모르겠어." },
      ],
    };
  });

  return {
    maxTurns: Math.max(1, turns.length),
    idleStopSeconds: IDLE_STOP_SECONDS,
    turns,
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
