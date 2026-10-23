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
  // 이 표현을 틀린 학습 차시와 그 학습 시각(ISO). 같은 표현을 여러 차시에서 틀렸다면 가장 최근 것.
  lessonLabel?: string;
  studiedAt?: string;
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

// 지난 통화에서 표현별로 낸 결과. 다음 통화 문항의 우선순위를 정하는 데 쓴다.
export type PracticeRecord = {
  answerEn: string;
  outcome: "correct" | "retry" | "skipped";
  practicedAt: string;
};

export type BuildCallPlanInput = {
  id: string;
  studentId: string;
  scheduledAtLabel: string;
  items: LearningHistoryItem[];
  freeTalk: FreeTalkPlan;
  estimatedMinutes?: number;
  maxTargets?: number;
  practiced?: PracticeRecord[];
};

function defaultHint(sourceType: LearningSourceType): string {
  if (sourceType === "word") {
    return "첫소리를 떠올리며 영어 단어로 말해봐.";
  }
  return "핵심 동사와 시제를 먼저 확인해봐.";
}

function expressionKey(answerEn: string): string {
  return answerEn.toLowerCase().replace(/[.?!,]/g, "").replace(/\s+/g, " ").trim();
}

// study-api 학습 시각(studyDateTime)은 시간대 없는 한국 시간이다. 통화 시각(UTC ISO)과 비교할 수 있게 바꾼다.
export function kstToIso(value?: string | null): string | undefined {
  const text = value?.trim().replace(" ", "T");
  if (!text) return undefined;
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text.length === 10 ? `${text}T00:00:00` : text}+09:00`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export const MAX_CALL_TARGETS = 10;
const ROTATION_TARGETS = 3;

export type CallPlanSelection = {
  // new: 지난 복습 이후 새로 학습한 차시의 오답 / review: 복습 필요(틀림·넘김) / rotation: 모두 맞혀 돌아가며 다시 보기
  mode: "new" | "review" | "rotation" | "empty";
  items: LearningHistoryItem[];
};

// 출제 규칙
// 1. 새 학습 우선: 표현을 마지막으로 통화에서 연습한 뒤(또는 한 번도 연습 안 한 상태에서) 학습 차시에서 또 틀린 표현.
//    최근 학습한 차시부터, 차시 안에서는 학습 순서대로. 여러 차시를 학습했으면 모두 내되 최대 10문항.
// 2. 새 학습이 없으면 복습 필요: 가장 최근 통화 결과가 틀림(먼저)·넘김인 표현. 오래전에 연습한 것부터, 최대 10문항.
// 3. 그것도 없으면(모두 맞힘) 가장 오래전에 연습한 표현 3개를 돌아가며 다시 본다.
export function selectCallItems(
  items: LearningHistoryItem[],
  practiced: PracticeRecord[] = [],
  maxTargets = MAX_CALL_TARGETS,
): CallPlanSelection {
  const latest = new Map<string, PracticeRecord>();
  for (const record of practiced) {
    const key = expressionKey(record.answerEn);
    const seen = latest.get(key);
    if (!seen || seen.practicedAt < record.practicedAt) latest.set(key, record);
  }
  const ranked = items.map((item, order) => ({ item, order, record: latest.get(expressionKey(item.answerEn)) }));

  const fresh = ranked
    .filter(({ item, record }) => !record || (item.studiedAt ?? "") > record.practicedAt)
    .sort((a, b) => (b.item.studiedAt ?? "").localeCompare(a.item.studiedAt ?? "") || a.order - b.order);
  if (fresh.length > 0) return { mode: "new", items: fresh.slice(0, maxTargets).map(({ item }) => item) };

  const outcomeRank = { retry: 0, skipped: 1, correct: 2 } as const;
  const review = ranked
    .filter(({ record }) => record && record.outcome !== "correct")
    .sort(
      (a, b) =>
        outcomeRank[a.record!.outcome] - outcomeRank[b.record!.outcome] ||
        a.record!.practicedAt.localeCompare(b.record!.practicedAt) ||
        a.order - b.order,
    );
  if (review.length > 0) return { mode: "review", items: review.slice(0, maxTargets).map(({ item }) => item) };

  const rotation = [...ranked].sort(
    (a, b) => (a.record?.practicedAt ?? "").localeCompare(b.record?.practicedAt ?? "") || a.order - b.order,
  );
  if (rotation.length > 0) {
    return { mode: "rotation", items: rotation.slice(0, Math.min(ROTATION_TARGETS, maxTargets)).map(({ item }) => item) };
  }
  return { mode: "empty", items: [] };
}

export function buildCallPlanFromLearningItems({
  id,
  studentId,
  scheduledAtLabel,
  items,
  freeTalk,
  estimatedMinutes = 5,
  maxTargets = MAX_CALL_TARGETS,
  practiced = [],
}: BuildCallPlanInput): CallPlan {
  const selected = selectCallItems(items, practiced, maxTargets).items;

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
// 짧은 대화는 복습 문항 수와 상관없이 3번. 서버(free-talk·결과 저장)도 이 횟수까지만 받는다.
export const FREE_TALK_TURNS = 3;
// AI 질문을 만들 때 보내는 표현 수(서버 free-talk 상한과 같다). 우선순위가 높은 문항부터 보낸다.
export const FREE_TALK_EXPRESSIONS = 5;

// 복습 문항 채점. 축약형(He's = He is), 대소문자, 문장부호, 띄어쓰기 차이는 맞은 것으로 본다.
// exact: 표기까지 같음(끝 문장부호·따옴표 모양 차이만 허용) / close: 위 차이만 있음(정답 처리) / wrong: 틀림.
export type ReviewGrade = "exact" | "close" | "wrong";

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "can not"],
  [/\bcannot\b/g, "can not"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\blet's\b/g, "let us"],
  [/\bi'm\b/g, "i am"],
  [/n't\b/g, " not"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'d\b/g, " would"],
  // he's/she's/it's/that's/what's/there's/who's/where's/how's → is (소유격과 섞이지 않게 대명사·의문사만)
  [/\b(he|she|it|that|what|there|here|who|where|how|this)'s\b/g, "$1 is"],
];

function normalizeAnswer(text: string): string {
  let value = text.toLowerCase().replace(/[’‘`]/g, "'");
  for (const [pattern, replacement] of CONTRACTIONS) value = value.replace(pattern, replacement);
  return value.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function surfaceForm(text: string): string {
  return text.replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

export function gradeReviewAnswer(answer: string, expected: string): ReviewGrade {
  if (!answer.trim()) return "wrong";
  if (surfaceForm(answer) === surfaceForm(expected)) return "exact";
  return normalizeAnswer(answer) === normalizeAnswer(expected) ? "close" : "wrong";
}

// AI 질문을 못 만들 때 쓰는 결정론적 짧은 대화. 대화하기 좋은 표현 하나를 소재로 고르고
// (묻는 문장 > 다른 문장 > 단어), 두 번째·세 번째 질문은 같은 소재에 이어지는 후속 질문이다.
export function pickTalkTopic(targets: LearningTarget[]): LearningTarget | undefined {
  const sentences = targets.filter((target) => !isWord(target.answerEn.trim()));
  return sentences.find((target) => target.answerEn.trim().endsWith("?")) ?? sentences[0] ?? targets[0];
}

export function buildTemplateFreeTalk(targets: LearningTarget[]): FreeTalkPlan {
  const topic = pickTalkTopic(targets);
  if (!topic) return { maxTurns: 1, idleStopSeconds: IDLE_STOP_SECONDS, turns: [] };
  const expression = topic.answerEn.trim();
  const plain = expression.replace(/[.!?]+$/, "");

  const opening: ConversationTurn = expression.endsWith("?")
    ? {
        id: "talk-1",
        relatedExpression: expression,
        questionEn: expression,
        questionMeaningKo: `${topic.promptKo}`,
        answerHint: "Yes나 No로 시작해서 한 문장으로 말해 봐요.",
        previewVoiceAnswer: "Yes, I do.",
        choices: [
          { id: "talk-1-a", answerEn: "Yes, I do.", meaningKo: "응, 그래." },
          { id: "talk-1-b", answerEn: "No, I don't.", meaningKo: "아니, 안 그래." },
          { id: "talk-1-c", answerEn: "A little.", meaningKo: "조금." },
        ],
      }
    : isWord(plain)
      ? {
          id: "talk-1",
          relatedExpression: expression,
          questionEn: `Can you make a short sentence with "${plain}"?`,
          questionMeaningKo: `"${plain}"를 넣어서 짧은 문장을 말해 볼래?`,
          answerHint: `단어 하나만 말해도 괜찮아요. "${plain}"부터 말해 봐요.`,
          previewVoiceAnswer: `I know the word ${plain}.`,
          choices: [
            { id: "talk-1-a", answerEn: `I know the word ${plain}.`, meaningKo: `나는 ${plain}라는 단어를 알아.` },
            { id: "talk-1-b", answerEn: `${plain[0]!.toUpperCase()}${plain.slice(1)}.`, meaningKo: "단어만 말해도 좋아요." },
            { id: "talk-1-c", answerEn: "I'm not sure.", meaningKo: "잘 모르겠어." },
          ],
        }
      : {
          id: "talk-1",
          relatedExpression: expression,
          questionEn: `When can you say "${plain}"?`,
          questionMeaningKo: `"${plain}"는 언제 말할 수 있을까?`,
          answerHint: "I can say it at…로 시작해 봐요.",
          previewVoiceAnswer: "I can say it at school.",
          choices: [
            { id: "talk-1-a", answerEn: "I can say it at school.", meaningKo: "학교에서 말할 수 있어." },
            { id: "talk-1-b", answerEn: "I can say it at home.", meaningKo: "집에서 말할 수 있어." },
            { id: "talk-1-c", answerEn: "I'm not sure.", meaningKo: "잘 모르겠어." },
          ],
        };

  const followUps: ConversationTurn[] = [
    {
      id: "talk-2",
      relatedExpression: expression,
      questionEn: "Nice! Can you tell me more about that?",
      questionMeaningKo: "좋아! 그것에 대해 조금 더 말해 줄래?",
      answerHint: "I like…나 It is…로 한 문장 더 말해 봐요.",
      previewVoiceAnswer: "I like it a lot.",
      choices: [
        { id: "talk-2-a", answerEn: "I like it a lot.", meaningKo: "나는 그게 정말 좋아." },
        { id: "talk-2-b", answerEn: "It is fun.", meaningKo: "재미있어." },
        { id: "talk-2-c", answerEn: "I'm not sure.", meaningKo: "잘 모르겠어." },
      ],
    },
    {
      id: "talk-3",
      relatedExpression: expression,
      questionEn: "Great! Why do you think so?",
      questionMeaningKo: "멋져! 왜 그렇게 생각해?",
      answerHint: "Because…로 시작해 봐요.",
      previewVoiceAnswer: "Because it is fun.",
      choices: [
        { id: "talk-3-a", answerEn: "Because it is fun.", meaningKo: "재미있으니까." },
        { id: "talk-3-b", answerEn: "Because I like it.", meaningKo: "좋아하니까." },
        { id: "talk-3-c", answerEn: "I don't know.", meaningKo: "모르겠어." },
      ],
    },
  ];

  const turns = [opening, ...followUps].slice(0, FREE_TALK_TURNS);
  return { maxTurns: turns.length, idleStopSeconds: IDLE_STOP_SECONDS, turns };
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

// 저장된 지난 통화 결과. 마이페이지에서 눌러 그날의 리포트를 다시 본다.
export type PastCallReport = {
  endedAt: string;
  finishReason: "completed" | "stopped" | "no-response";
  reviewedCount: number;
  targets: {
    id: string;
    sourceLabel: string;
    promptKo: string;
    answerEn: string;
    outcome: "correct" | "retry" | "skipped";
    learnerAnswer?: string;
  }[];
  // 짧은 대화: 베플리 질문과 내 대답(리포트에서 대화 형식으로 다시 본다).
  conversation: { questionEn: string; answer: string }[];
  // 짧은 대화가 끝난 뒤 베플리가 남긴 피드백(교사 리포트에도 같은 글이 보인다).
  talkFeedback?: string;
};

export type CallHistoryEntry = {
  id: string;
  completedAtLabel: string;
  focusLabel: string;
  resultLabel: string;
  expressions: string[];
  report?: PastCallReport;
};

export type TeacherScheduleSettings = {
  studentLabel: string;
  weekdays: string[];
  time: string;
  callsPerWeek: number;
  reminderMinutesBefore: number;
  managedBy: "teacher";
};
