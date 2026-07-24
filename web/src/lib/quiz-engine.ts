import type { LearningItem, MasteryStatus, SessionResult, TutorResponse } from "./types";

export const MAX_ATTEMPTS = 3;

export type AttemptSituation = "correct" | "retry" | "reveal" | "help";

export type AttemptDecision = TutorResponse & {
  situation: AttemptSituation;
  attemptNumber: number;
  nextAttemptCount: number;
};

const HELP_PATTERNS = [
  "힌트",
  "모르",
  "뭐",
  "어떻게",
  "help",
  "hint",
  "again",
  "다시",
];

export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[.?!,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHelpRequest(value: string) {
  const normalized = value.toLowerCase().trim();
  return HELP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isCorrectAnswer(item: LearningItem, answer: string) {
  return normalizeAnswer(item.answerEn) === normalizeAnswer(answer);
}

export function getQuestionPrompt(item: LearningItem, index: number, total: number) {
  return `${index + 1}/${total} · ${item.sourceLabel} 복습\n${item.promptKo}`;
}

export function maskAnswer(answer: string) {
  return answer
    .split(" ")
    .map((word) => {
      if (word.length <= 2) return word[0] ? `${word[0]}_` : "_";
      return `${word[0]}${"_".repeat(Math.max(1, word.length - 2))}${word[word.length - 1]}`;
    })
    .join(" ");
}

export function scoreStatus(status: MasteryStatus) {
  if (status === "Perfect") return 100;
  if (status === "Good") return 75;
  return 50;
}

export function calculateSessionScore(results: SessionResult[]) {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, item) => sum + scoreStatus(item.status), 0);
  return Math.round(total / results.length);
}

export function evaluateAttempt(
  item: LearningItem,
  answer: string,
  attemptNumber: number,
): TutorResponse {
  const decision = decideAttempt(item, answer, Math.max(0, attemptNumber - 1));
  return {
    countsAsAttempt: decision.countsAsAttempt,
    reply: decision.reply,
    status: decision.status,
  };
}

// `previousAttemptCount`는 현재 답변을 제출하기 전까지 실제로 카운트된 오답/정답
// 시도 수다. 힌트 요청은 횟수를 늘리지 않고, 정답 판정과 3진아웃은 항상 이
// 순수 함수가 결정한다. AI는 이 결과를 변경하지 않고 표현만 담당한다.
export function decideAttempt(
  item: LearningItem,
  answer: string,
  previousAttemptCount: number,
): AttemptDecision {
  const safePreviousCount = Math.max(0, previousAttemptCount);
  const attemptNumber = safePreviousCount + 1;

  if (isHelpRequest(answer)) {
    return {
      situation: "help",
      countsAsAttempt: false,
      attemptNumber,
      nextAttemptCount: safePreviousCount,
      reply:
        safePreviousCount < 1
          ? `한국어 뜻을 영어로 바꾸면 돼. 핵심 뜻은 "${item.meaningKo ?? item.promptKo}" 쪽이야.`
          : `정답 모양은 ${maskAnswer(item.answerEn)} 이야. 정확한 철자와 어순을 떠올려봐.`,
    };
  }

  if (isCorrectAnswer(item, answer)) {
    const status: MasteryStatus = attemptNumber === 1 ? "Perfect" : "Good";
    return {
      situation: "correct",
      countsAsAttempt: true,
      attemptNumber,
      nextAttemptCount: attemptNumber,
      status,
      reply:
        status === "Perfect"
          ? `정확해. 첫 시도에 바로 맞췄어.`
          : `맞았어. 이번엔 복습이 됐으니 같은 표현을 한 번 더 자주 써보면 좋아.`,
    };
  }

  if (attemptNumber >= MAX_ATTEMPTS) {
    return {
      situation: "reveal",
      countsAsAttempt: true,
      attemptNumber,
      nextAttemptCount: attemptNumber,
      status: "Not mastered",
      reply: `이번 문항은 여기서 정리할게. 정답은 "${item.answerEn}" 이야. 다음 학습에서 다시 확인하자.`,
    };
  }

  return {
    situation: "retry",
    countsAsAttempt: true,
    attemptNumber,
    nextAttemptCount: attemptNumber,
    reply:
      attemptNumber === 1
        ? `아직 달라. 뜻은 맞게 보고 있으니 철자나 어순을 다시 확인해봐.`
        : `거의 왔어. 정답은 ${maskAnswer(item.answerEn)} 형태야.`,
  };
}
