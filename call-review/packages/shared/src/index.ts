export type CallPhase =
  | "home"
  | "incoming"
  | "connecting"
  | "review"
  | "free-talk"
  | "closing"
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

// 표현별 통화 결과. correct: 한 번에 맞힘 / hinted: 힌트 받고 맞힘(다음 통화에 한 번 더) /
// retry: 끝내 못 맞힘(복습 필요) / skipped: 넘김.
export type CallTargetOutcome = "correct" | "hinted" | "retry" | "skipped";

// 지난 통화에서 표현별로 낸 결과. 다음 통화 문항의 우선순위를 정하는 데 쓴다.
export type PracticeRecord = {
  answerEn: string;
  outcome: CallTargetOutcome;
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
// 2. 새 학습이 없으면 복습 필요: 가장 최근 통화 결과가 틀림(먼저)·힌트로 완료·넘김인 표현. 오래전에 연습한 것부터, 최대 10문항.
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

  const outcomeRank = { retry: 0, hinted: 1, skipped: 2, correct: 3 } as const;
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

// 같은 말을 다르게 적는 경우(OK = Okay, 2 = two). 음성 인식이 어느 쪽으로든 적는다.
const SAME_WORDS: Record<string, string> = {
  ok: "okay",
  okey: "okay",
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};

function normalizeAnswer(text: string): string {
  let value = text.toLowerCase().replace(/[’‘`]/g, "'").replace(/\bo\.\s?k\b\.?/g, "okay");
  for (const [pattern, replacement] of CONTRACTIONS) value = value.replace(pattern, replacement);
  return value
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SAME_WORDS[word] ?? word)
    .join(" ");
}

function surfaceForm(text: string): string {
  return text.replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

export function gradeReviewAnswer(answer: string, expected: string): ReviewGrade {
  if (!answer.trim()) return "wrong";
  if (surfaceForm(answer) === surfaceForm(expected)) return "exact";
  return normalizeAnswer(answer) === normalizeAnswer(expected) ? "close" : "wrong";
}

// 복습 한 문항에서 답할 수 있는 횟수. 1·2번째 오답에는 힌트를 주고, 3번째 오답이면 정답을 알려 주고 넘어간다.
export const MAX_REVIEW_ATTEMPTS = 3;

// 영어 알파벳 이름 뒤 조사: m(엠)·n(엔)만 받침이 있어 "으로", 나머지(l·r은 ㄹ 받침)는 "로".
function letterWithRo(letter: string): string {
  return `${letter}${/^[mn]$/i.test(letter) ? "으로" : "로"}`;
}

function answerWords(answerEn: string): string[] {
  return answerEn.trim().replace(/[.!?]+$/, "").split(/\s+/).filter(Boolean);
}

function firstLetter(answerEn: string): string {
  return answerEn.trim().match(/[A-Za-z]/)?.[0]?.toLowerCase() ?? "";
}

// 1번째 오답: 길이·첫 단어로 감을 잡게 한다. 2번째 오답: 철자 모양(g _ _ d)을 보여 준다. 정답 전체는 말하지 않는다.
export function reviewHint(answerEn: string, level: 1 | 2): string {
  const words = answerEn.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    const word = answerEn.trim().replace(/[.!?]+$/, "");
    const letters = word.replace(/[^A-Za-z]/g, "");
    if (level === 1) return `${letters.length}글자짜리 영어 단어예요. 뜻을 다시 떠올려 볼까요?`;
    const shape = [...word].map((char, index) => (index === 0 || !/[A-Za-z]/.test(char) ? char : "_")).join(" ");
    return `${letterWithRo(firstLetter(word))} 시작해요. ${shape}`;
  }
  const plain = answerWords(answerEn);
  if (level === 1) return `${plain.length}개 단어로 된 문장이에요. "${plain[0]} …"로 시작해요.`;
  const shape = plain.map((word) => `${word[0]}${"_".repeat(Math.max(word.length - 1, 0))}`).join(" ");
  return `이런 모양이에요. ${shape}`;
}

// 뜻은 맞지만 이번 레슨에서 배운 표현이 아닐 때(good 자리에 nice). 오답으로 세지 않고 다시 말해 보게 한다.
export function alternativeAnswerMessage(answer: string, answerEn: string): string {
  const words = answerWords(answerEn);
  if (words.length <= 1) {
    return `"${answer.trim().replace(/[.!?]+$/, "")}"도 맞는 말이에요! 그런데 이번 레슨에서는 ${letterWithRo(firstLetter(answerEn))} 시작하는 단어를 찾고 있어요.`;
  }
  return `뜻은 잘 통해요! 이번 레슨에서 배운 문장으로 다시 말해 볼까요? "${words[0]} …"로 시작해요.`;
}

// AI 질문을 못 만들 때 쓰는 결정론적 짧은 대화. 복습 표현을 그대로 묻거나 퀴즈처럼 쓰지 않는다.
// 학생에게 바로 물을 수 있는 질문 문장(Do you like movies?)이 있으면 그것으로, 없으면 하루 이야기로 대화한다.
export function pickTalkTopic(targets: LearningTarget[]): LearningTarget | undefined {
  return targets.find((target) => {
    const text = target.answerEn.trim();
    return !isWord(text) && text.endsWith("?") && /\byou\b/i.test(text);
  });
}

const DAILY_TALK_QUESTION = "How was your day today?";

function turn(id: string, relatedExpression: string, questionEn: string, questionMeaningKo: string, answerHint: string, choices: [string, string][]): ConversationTurn {
  return {
    id,
    relatedExpression,
    questionEn,
    questionMeaningKo,
    answerHint,
    previewVoiceAnswer: choices[0]![0],
    choices: choices.map(([answerEn, meaningKo], index) => ({ id: `${id}-${"abc"[index]}`, answerEn, meaningKo })),
  };
}

export function buildTemplateFreeTalk(targets: LearningTarget[]): FreeTalkPlan {
  const topic = pickTalkTopic(targets);
  const expression = topic?.answerEn.trim() ?? DAILY_TALK_QUESTION;

  const opening = topic
    ? turn("talk-1", expression, expression, topic.promptKo, "Yes나 No로 시작해서 한 문장으로 말해 봐요.", [
        ["Yes, I do.", "응, 그래."],
        ["No, I don't.", "아니, 안 그래."],
        ["A little.", "조금."],
      ])
    : turn("talk-1", expression, expression, "오늘 하루 어땠어?", "It was…로 시작해서 한 문장으로 말해 봐요.", [
        ["It was good.", "좋았어."],
        ["It was fun.", "재미있었어."],
        ["I was a little tired.", "조금 피곤했어."],
      ]);

  const followUps: ConversationTurn[] = topic
    ? [
        turn("talk-2", expression, "Nice! Can you tell me more about that?", "좋아! 그것에 대해 조금 더 말해 줄래?", "I like…나 It is…로 한 문장 더 말해 봐요.", [
          ["I like it a lot.", "나는 그게 정말 좋아."],
          ["It is fun.", "재미있어."],
          ["I'm not sure.", "잘 모르겠어."],
        ]),
        turn("talk-3", expression, "Great! Why do you think so?", "멋져! 왜 그렇게 생각해?", "Because…로 시작해 봐요.", [
          ["Because it is fun.", "재미있으니까."],
          ["Because I like it.", "좋아하니까."],
          ["I don't know.", "모르겠어."],
        ]),
      ]
    : [
        turn("talk-2", expression, "I see! What did you do after school?", "그렇구나! 학교 끝나고 뭐 했어?", "I played…나 I went to…로 말해 봐요.", [
          ["I played games.", "게임을 했어."],
          ["I went to an academy.", "학원에 갔어."],
          ["I did my homework.", "숙제를 했어."],
        ]),
        turn("talk-3", expression, "Sounds good! What do you want to do this weekend?", "좋네! 이번 주말에는 뭐 하고 싶어?", "I want to…로 시작해 봐요.", [
          ["I want to go to the park.", "공원에 가고 싶어."],
          ["I want to watch a movie.", "영화를 보고 싶어."],
          ["I want to sleep a lot.", "푹 자고 싶어."],
        ]),
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
    outcome: CallTargetOutcome;
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
