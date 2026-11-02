import { useEffect, useMemo, useRef, useState } from "react";

import type { CallPhase, CallPlan, ConversationTurn, InputMode } from "@yoon-call/shared";
import {
  alternativeAnswerMessage,
  blankAnswerTarget,
  FREE_TALK_EXPRESSIONS,
  gradeReviewAnswer,
  gradeSentenceTyped,
  isCloseMiss,
  isNearSpelling,
  isSentence,
  MAX_REVIEW_ATTEMPTS,
  reviewHint,
} from "@yoon-call/shared";

import type { AnswerCheckRequest, FreeTalkTurnRequest, GeneratedTurn } from "./callReviewApi";

export type VoiceState = "idle" | "preparing" | "listening" | "transcribing" | "review";
export type FinishReason = "completed" | "stopped" | "no-response";
// correct: 맞힘(다음 표현으로) / hint: 아직 기회가 남음(힌트를 보고 다시 말함) / retry: 3번째 오답(정답 공개).
// message: 카드 제목 멘트(매번 다르게 고른다). hint: 힌트 문장(뜻은 맞는 다른 답이면 없음).
export type ReviewFeedback = { kind: "correct" | "hint" | "retry"; answer: string; message?: string; hint?: string };
// correct: 한 번에 맞힘 / hinted: 힌트 받고 맞힘 / retry: 끝내 못 맞힘.
export type ReviewOutcome = "correct" | "hinted" | "retry";

export type ConversationTurnRecord = { questionEn: string; answer: string };

// 실회원 모드에서만 주입된다. 없으면(프리뷰) 템플릿 질문과 가짜 인식 결과를 쓴다.
export type SessionServices = {
  generateTurn?: (request: FreeTalkTurnRequest) => Promise<GeneratedTurn | null>;
  // 규칙상 틀린 답이 뜻으로는 맞는지(good 자리에 nice) 판정. 없으면 규칙 채점만 쓴다.
  checkAnswer?: (request: AnswerCheckRequest) => Promise<boolean>;
  voice?: {
    start: () => Promise<void>;
    stop: () => Promise<string | null>;
    transcribe: (uri: string) => Promise<string>;
  };
  // 읽어 줄 질문이 정해지면 미리 받아 둔다(첫 대화 질문은 복습 중에 미리 만들어진다).
  prepareSpeech?: (questionEn: string) => Promise<void>;
};

// 복습 표현을 틀렸을 때 고르는 멘트. 정답에 가까운 답(철자 한두 글자, 단어 대부분 일치)에만 "거의"류를 쓰고,
// 먼 답에는 가깝다고 하지 않는다. 같은 멘트가 연달아 나오지 않게 한다.
export const NEAR_RETRY_MESSAGES = ["거의 맞혔어요", "조금만 더 하면 돼요", "아깝다! 한 끗 차이예요", "거의 다 왔어요"] as const;
export const RETRY_MESSAGES = ["아, 아쉬워요", "좋은 시도였어요", "괜찮아요, 다시 해 봐요", "천천히 다시 떠올려 볼까요?"] as const;

export function pickRetryMessage(previous?: string, random: () => number = Math.random, near = false): string {
  const pool: readonly string[] = near ? NEAR_RETRY_MESSAGES : RETRY_MESSAGES;
  const choices = pool.filter((message) => message !== previous);
  return choices[Math.floor(random() * choices.length)] ?? pool[0]!;
}

// 축약형·대소문자·문장부호만 다르게 말했을 때 고르는 멘트. 정답이므로 "거의"·"대체로"처럼 틀린 듯한 말은 쓰지 않는다.
export const CLOSE_MESSAGES = [
  "정답이에요! 잘 알고 있네요",
  "맞았어요!",
  "좋아요, 정답이에요",
  "정확해요! 뜻이 딱 맞아요",
  "네, 맞아요! 잘했어요",
] as const;

export function pickCloseMessage(previous?: string, random: () => number = Math.random): string {
  const choices = CLOSE_MESSAGES.filter((message) => message !== previous);
  return choices[Math.floor(random() * choices.length)] ?? CLOSE_MESSAGES[0];
}

// 힌트를 받고 맞혔을 때 고르는 멘트.
export const HINTED_MESSAGES = ["맞았어요! 스스로 찾아냈네요", "좋아요, 힌트를 잘 활용했어요", "맞아요! 잘 기억해 냈어요"] as const;

export function pickHintedMessage(previous?: string, random: () => number = Math.random): string {
  const choices = HINTED_MESSAGES.filter((message) => message !== previous);
  return choices[Math.floor(random() * choices.length)] ?? HINTED_MESSAGES[0];
}

// 판정 AI를 기다리는 최대 시간(서버 제한보다 조금 길게). 넘으면 오답으로 본다.
const ANSWER_CHECK_WAIT_MS = 4500;

type HomeSection = "home" | "my-page";

// 통화마다 새로 만드는 결과 저장용 멱등 키(재전송 시 중복 저장 방지).
function newCallId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const INTRO_LINE =
  "안녕! 오늘은 지난 학습에서 헷갈렸던 표현 세 개만 같이 확인해보자.";
const QUESTION_SETTLE_MS = 1500;
// Preview only: long enough to read the connection checklist.
const CONNECT_PREVIEW_MS = 1800;
// AI 질문을 이보다 오래 기다리지 않고 템플릿 질문을 쓴다.
const TURN_TIMEOUT_MS = 9000;
// 첫 질문은 통화 시작 때 미리 만들어 두고, 대화에 들어갈 때 이만큼만 더 기다린다.
const FIRST_TURN_WAIT_MS = 2500;
// 질문 글자와 음성이 함께 나오도록 음성을 받아 둘 때까지 '입력 중'을 보여 준다. 너무 늦으면 글자부터 띄운다.
const SPEECH_READY_WAIT_MS = 5000;
// 마지막 대답을 보여 주는 시간.
const LAST_REPLY_SHOW_MS = 1800;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function toConversationTurn(turn: GeneratedTurn, index: number): ConversationTurn {
  return {
    id: `ai-${index}`,
    relatedExpression: turn.topic,
    questionEn: turn.questionEn,
    questionMeaningKo: turn.questionMeaningKo,
    answerHint: turn.answerHint,
    previewVoiceAnswer: turn.choices[0]?.answerEn ?? "",
    choices: turn.choices.map((choice, choiceIndex) => ({ id: `ai-${index}-${choiceIndex}`, ...choice })),
  };
}

export function useCallSession(plan: CallPlan, services: SessionServices = {}) {
  const [phase, setPhase] = useState<CallPhase>("home");
  const [homeSection, setHomeSection] = useState<HomeSection>("home");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [targetIndex, setTargetIndex] = useState(0);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [heardText, setHeardText] = useState("");
  const [typedText, setTypedText] = useState("");
  const [hintOpen, setHintOpen] = useState(false);
  const [freeTalkTurnIndex, setFreeTalkTurnIndex] = useState(0);
  const [shownTurns, setShownTurns] = useState<Record<number, ConversationTurn>>({});
  const [turnLoading, setTurnLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [conversationTurns, setConversationTurns] = useState<ConversationTurnRecord[]>([]);
  const [choiceAssistOpen, setChoiceAssistOpen] = useState(false);
  const [finishReason, setFinishReason] =
    useState<FinishReason>("completed");
  const [coachLine, setCoachLine] = useState(INTRO_LINE);
  const [reviewFeedback, setReviewFeedback] = useState<ReviewFeedback | null>(null);
  // 다시 말하려고 피드백 카드를 닫을 때 그 카드의 힌트만 문제 칸에 남겨 둔다(표현이 바뀌면 지운다).
  const [carriedHint, setCarriedHint] = useState<string | null>(null);
  // 표현마다 처음 확정된 결과가 남는다(정답 공개 뒤 다시 말해 맞혀도 바뀌지 않음).
  const [reviewOutcomes, setReviewOutcomes] = useState<Record<number, ReviewOutcome>>({});
  // 표현마다 학생이 말한 답(순서대로).
  const [reviewAttempts, setReviewAttempts] = useState<Record<number, string[]>>({});
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  // 표현마다 틀린 횟수(뜻은 맞는 다른 답은 세지 않음)와 도움(힌트·다른 답 안내)을 받았는지.
  const wrongCounts = useRef<Record<number, number>>({});
  const helped = useRef<Record<number, boolean>>({});
  const [callId, setCallId] = useState(newCallId);
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(plan.freeTalk.idleStopSeconds);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 통화가 바뀌면 늦게 도착한 AI 질문·음성 인식 결과를 버리기 위한 세대 번호.
  const generation = useRef(0);
  const firstTurn = useRef<Promise<ConversationTurn | null> | null>(null);
  const lastRetryMessage = useRef<string | undefined>(undefined);
  // 짧은 대화 소재(첫 질문에서 정해짐). 후속 질문은 이 소재에 이어서 묻는다.
  const talkTopic = useRef<string | undefined>(undefined);

  const isCallSurface =
    phase === "incoming" ||
    phase === "connecting" ||
    phase === "greeting" ||
    phase === "review" ||
    phase === "free-talk" ||
    phase === "closing";
  const target = plan.targets[targetIndex];
  const freeTalkTurn =
    shownTurns[freeTalkTurnIndex] ?? plan.freeTalk.turns[freeTalkTurnIndex] ?? plan.freeTalk.turns[0]!;
  const progressLabel = useMemo(() => {
    if (phase === "free-talk") {
      return `질문 ${freeTalkTurnIndex + 1} / ${plan.freeTalk.maxTurns}`;
    }
    return `표현 ${Math.min(targetIndex + 1, plan.targets.length)} / ${plan.targets.length}`;
  }, [freeTalkTurnIndex, phase, plan.freeTalk.maxTurns, plan.targets.length, targetIndex]);

  useEffect(() => {
    // 질문을 읽어 주는 동안·다음 질문을 만드는 동안·말하는 동안에는 세지 않는다.
    // 읽기가 끝나면 다시 시작해 학생에게 온전한 시간을 준다.
    if (phase !== "free-talk" || voiceState !== "idle" || turnLoading || speaking) {
      return;
    }
    const startedAt = Date.now() + QUESTION_SETTLE_MS;
    const deadline = startedAt + plan.freeTalk.idleStopSeconds * 1000;
    setIdleSecondsLeft(plan.freeTalk.idleStopSeconds);
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setIdleSecondsLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        setFinishReason("no-response");
        setPhase("complete");
      }
    }, 250);
    return () => clearInterval(interval);
  }, [
    freeTalkTurnIndex,
    phase,
    plan.freeTalk.idleStopSeconds,
    typedText,
    voiceState,
    choiceAssistOpen,
    turnLoading,
    speaking,
  ]);

  const expressions = useMemo(
    () =>
      plan.targets.slice(0, FREE_TALK_EXPRESSIONS).map((item) => ({
        answerEn: item.answerEn,
        promptKo: item.promptKo,
        sourceType: (item.answerEn.trim().includes(" ") ? "sentence" : "word") as "word" | "sentence",
      })),
    [plan.targets],
  );

  async function requestTurn(turnIndex: number, history: ConversationTurnRecord[]): Promise<ConversationTurn | null> {
    if (!services.generateTurn || expressions.length === 0) return null;
    try {
      const generated = await withTimeout(
        services.generateTurn({
          expressions,
          history,
          turnIndex,
          ...(turnIndex > 0 && talkTopic.current ? { topic: talkTopic.current } : {}),
        }),
        TURN_TIMEOUT_MS,
        null,
      );
      return generated ? toConversationTurn(generated, turnIndex) : null;
    } catch {
      return null;
    }
  }

  function waitForSpeech(questionEn: string): Promise<void> {
    const ready = services.prepareSpeech?.(questionEn).catch(() => undefined);
    return ready ? withTimeout(ready, SPEECH_READY_WAIT_MS, undefined) : Promise.resolve();
  }

  function showTurn(index: number, turn: ConversationTurn) {
    setShownTurns((current) => ({ ...current, [index]: turn }));
    setFreeTalkTurnIndex(index);
    setChoiceAssistOpen(false);
    setCoachLine(turn.questionEn);
  }

  function stopRecordingQuietly() {
    if (voiceState === "listening") void services.voice?.stop().catch(() => undefined);
  }

  function resetCall() {
    generation.current += 1;
    firstTurn.current = null;
    talkTopic.current = undefined;
    stopRecordingQuietly();
    setPhase("home");
    setTargetIndex(0);
    setVoiceState("idle");
    setVoiceError(null);
    setHeardText("");
    setTypedText("");
    setHintOpen(false);
    setFreeTalkTurnIndex(0);
    setShownTurns({});
    setTurnLoading(false);
    setSpeaking(false);
    setConversationTurns([]);
    setChoiceAssistOpen(false);
    setFinishReason("completed");
    setHomeSection("home");
    setCoachLine(INTRO_LINE);
    setReviewFeedback(null);
    setCarriedHint(null);
    setReviewOutcomes({});
    setReviewAttempts({});
    setCheckingAnswer(false);
    wrongCounts.current = {};
    helped.current = {};
    setCallId(newCallId());
    setCallStartedAt(null);
    setIdleSecondsLeft(plan.freeTalk.idleStopSeconds);
  }

  function answerIncomingCall() {
    setCallStartedAt(new Date().toISOString());
    setPhase("connecting");
    // 복습하는 동안 첫 대화 질문을 미리 만들어 둔다.
    firstTurn.current = requestTurn(0, []);
    void firstTurn.current.then((turn) => {
      if (turn) void services.prepareSpeech?.(turn.questionEn);
    });
    // 연결되면 베플리가 먼저 인사한다(전화처럼). 인사가 끝나면 startLesson으로 복습을 시작한다.
    connectTimer.current = setTimeout(() => setPhase("greeting"), CONNECT_PREVIEW_MS);
  }

  // 인사 뒤 학습 시작. 복습할 표현이 없으면 바로 짧은 대화로 넘어간다.
  function startLesson() {
    if (phase !== "greeting") return;
    if (plan.targets.length > 0) setPhase("review");
    else void enterFreeTalk();
  }

  function cancelConnecting() {
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = null;
    generation.current += 1;
    firstTurn.current = null;
    setPhase("home");
  }

  async function startListening() {
    setVoiceError(null);
    setHeardText("");
    // 다시 말하기 시작하면 앞 답의 피드백 카드는 닫는다(힌트는 문제 칸에 남긴다).
    if (phase === "review" && reviewFeedback && reviewFeedback.kind !== "correct") {
      const hint = reviewFeedback.kind === "hint" ? reviewFeedback.hint : undefined;
      if (hint) setCarriedHint(hint);
      setReviewFeedback(null);
    }
    if (!services.voice) {
      setVoiceState("listening");
      return;
    }
    setVoiceState("preparing");
    try {
      await services.voice.start();
      setVoiceState("listening");
    } catch {
      // 마이크 권한이 없거나 쓸 수 없으면 글자로 답하게 한다.
      setVoiceState("idle");
      setInputMode("text");
      setVoiceError("마이크를 쓸 수 없어요. 글자로 답해 주세요.");
    }
  }

  async function finishListening() {
    // The choices panel would cover the "이렇게 들었어" card.
    setChoiceAssistOpen(false);
    if (!services.voice) {
      if (phase === "free-talk") {
        submitAnswer(freeTalkTurn.previewVoiceAnswer);
        return;
      }
      setHeardText(target?.answerEn ?? "");
      setVoiceState("review");
      return;
    }
    const current = generation.current;
    setVoiceState("transcribing");
    try {
      const uri = await services.voice.stop();
      const text = uri ? (await services.voice.transcribe(uri)).trim() : "";
      if (current !== generation.current) return;
      if (!text) {
        setVoiceState("idle");
        setVoiceError("잘 들리지 않았어요. 한 번 더 말해 볼까요?");
        return;
      }
      // 짧은 대화는 들은 말을 확인하지 않고 바로 대답으로 보내 다음 질문으로 넘어간다(복습 문항만 확인 단계를 둔다).
      if (phase === "free-talk") {
        submitAnswer(text);
        return;
      }
      setHeardText(text);
      setVoiceState("review");
    } catch (error) {
      console.warn("[voice] 음성 인식 실패", error);
      if (current !== generation.current) return;
      setVoiceState("idle");
      setVoiceError("말한 내용을 알아듣지 못했어요. 다시 말하거나 글자로 답해 주세요.");
    }
  }

  function beginOrStopVoice() {
    if (voiceState === "idle") {
      void startListening();
      return;
    }
    if (voiceState === "listening") {
      void finishListening();
      return;
    }
    if (voiceState === "review") submitAnswer(heardText);
  }

  function submitTypedAnswer() {
    const value = typedText.trim();
    if (!value) return;
    submitAnswer(value);
  }

  async function advanceFreeTalk(history: ConversationTurnRecord[]) {
    const nextTurnIndex = freeTalkTurnIndex + 1;
    const fallback = plan.freeTalk.turns[nextTurnIndex];
    if (nextTurnIndex >= plan.freeTalk.maxTurns || !fallback) {
      // 마지막 답도 화면에 '내 답변'으로 잠깐 보여 준(베플리는 맞장구) 뒤 마무리 인사 화면으로 간다.
      const current = generation.current;
      setFinishReason("completed");
      setTurnLoading(true);
      await new Promise((resolve) => setTimeout(resolve, LAST_REPLY_SHOW_MS));
      if (current !== generation.current) return;
      setTurnLoading(false);
      setPhase("closing");
      return;
    }
    const current = generation.current;
    setTurnLoading(true);
    const generated = await requestTurn(nextTurnIndex, history);
    if (current !== generation.current) return;
    const next = generated ?? fallback;
    await waitForSpeech(next.questionEn);
    if (current !== generation.current) return;
    setTurnLoading(false);
    showTurn(nextTurnIndex, next);
  }

  function submitAnswer(value: string) {
    if (!value.trim() || checkingAnswer) return;
    setHintOpen(false);
    setHeardText("");
    setTypedText("");
    setVoiceState("idle");
    setVoiceError(null);

    if (phase === "free-talk") {
      const history = [...conversationTurns, { questionEn: freeTalkTurn.questionEn, answer: value }];
      setConversationTurns(history);
      void advanceFreeTalk(history);
      return;
    }

    void judgeReviewAnswer(value);
  }

  // 복습 답 판정: 규칙 채점 → (틀리면) 뜻이 맞는 다른 답인지 AI 판정 → 1·2번째 오답은 힌트, 3번째 오답은 정답 공개.
  async function judgeReviewAnswer(value: string) {
    if (!target) return;
    const index = targetIndex;
    const current = generation.current;
    const decided = reviewOutcomes[index];
    setReviewAttempts((attempts) => ({ ...attempts, [index]: [...(attempts[index] ?? []), value] }));

    const remember = (message: string) => {
      lastRetryMessage.current = message;
      return message;
    };
    const finish = (outcome: ReviewOutcome, feedback: ReviewFeedback, line: string) => {
      setReviewFeedback(feedback);
      setReviewOutcomes((outcomes) => (outcomes[index] ? outcomes : { ...outcomes, [index]: outcome }));
      setCoachLine(line);
    };

    // 문장 문항을 글자로 답할 때는 빈칸 단어만 써도 된다. 말할 때는 문장 전체로 채점한다.
    const sentence = isSentence(target.answerEn);
    const typedSentence = sentence && inputMode === "text";
    const grade = typedSentence ? gradeSentenceTyped(value, target.answerEn) : gradeReviewAnswer(value, target.answerEn);
    // 틀렸을 때 가까운지 견줄 대상(글자로 빈칸만 쓴 답은 빈칸 단어와 비교한다).
    const compareTo = typedSentence && !value.trim().includes(" ") ? blankAnswerTarget(target.answerEn) : target.answerEn;
    const near = isCloseMiss(value, compareTo);
    const misspelled = isNearSpelling(value, compareTo);
    if (grade !== "wrong") {
      const hinted = !decided && ((wrongCounts.current[index] ?? 0) > 0 || helped.current[index] === true);
      const message = hinted
        ? remember(pickHintedMessage(lastRetryMessage.current))
        : grade === "close"
          ? remember(pickCloseMessage(lastRetryMessage.current))
          : undefined;
      finish(hinted ? "hinted" : "correct", { kind: "correct", answer: value, ...(message ? { message } : {}) }, "좋아요! 아주 자연스러워요.");
      return;
    }

    // 문장을 말로 답할 때 빈칸 단어만 말했으면(맞는 단어) 오답으로 세지 않고 문장 전체로 다시 말하게 한다.
    if (sentence && !typedSentence && gradeReviewAnswer(value, blankAnswerTarget(target.answerEn)) !== "wrong") {
      setReviewFeedback({ kind: "hint", answer: value, message: "단어는 맞았어요! 이번엔 전체 문장으로 다시 말해 봐요." });
      setCoachLine("전체 문장으로 다시 말해 볼까요?");
      return;
    }

    // 정답을 이미 알려 준 뒤 다시 말해 본 답은 결과를 바꾸지 않고 정답만 다시 보여 준다.
    if (decided) {
      finish(decided, { kind: "retry", answer: value, message: remember(pickRetryMessage(lastRetryMessage.current, Math.random, near)) }, "괜찮아요. 같이 다시 볼까요?");
      return;
    }

    // 뜻이 맞는 다른 표현인지 AI에게 묻는 건 단어 문항만(문장은 듣고 따라 말하기라 다른 표현을 받지 않는다).
    // 철자만 틀린 답도 묻지 않는다(오타를 "그것도 맞는 말"이라고 하지 않게).
    if (services.checkAnswer && !sentence && !misspelled) {
      setCheckingAnswer(true);
      const acceptable = await withTimeout(
        services
          .checkAnswer({
            answerEn: target.answerEn,
            promptKo: target.promptKo,
            sourceType: target.answerEn.trim().includes(" ") ? "sentence" : "word",
            answer: value,
          })
          .catch(() => false),
        ANSWER_CHECK_WAIT_MS,
        false,
      );
      if (current !== generation.current) return;
      setCheckingAnswer(false);
      if (acceptable) {
        helped.current[index] = true;
        setReviewFeedback({ kind: "hint", answer: value, message: alternativeAnswerMessage(value, target.answerEn) });
        setCoachLine("그것도 맞는 말이에요. 다시 말해 볼까요?");
        return;
      }
    }

    const wrong = (wrongCounts.current[index] ?? 0) + 1;
    wrongCounts.current[index] = wrong;
    if (wrong >= MAX_REVIEW_ATTEMPTS) {
      finish("retry", { kind: "retry", answer: value, message: remember(pickRetryMessage(lastRetryMessage.current, Math.random, near)) }, "괜찮아요. 같이 다시 볼까요?");
      return;
    }
    helped.current[index] = true;
    setReviewFeedback({
      kind: "hint",
      answer: value,
      message: misspelled ? remember("철자가 조금 달라요") : remember(pickRetryMessage(lastRetryMessage.current, Math.random, near)),
      hint: reviewHint(target.answerEn, wrong === 1 ? 1 : 2, inputMode === "text" ? "type" : "speak"),
    });
    setCoachLine("힌트를 보고 다시 말해 볼까요?");
  }

  async function enterFreeTalk() {
    const current = generation.current;
    setPhase("free-talk");
    setFreeTalkTurnIndex(0);
    setChoiceAssistOpen(false);
    setTurnLoading(true);
    const prepared = firstTurn.current
      ? await withTimeout(firstTurn.current, FIRST_TURN_WAIT_MS, null)
      : null;
    if (current !== generation.current) return;
    const opening = prepared ?? plan.freeTalk.turns[0]!;
    await waitForSpeech(opening.questionEn);
    if (current !== generation.current) return;
    setTurnLoading(false);
    talkTopic.current = opening.relatedExpression || undefined;
    showTurn(0, opening);
  }

  function continueReview() {
    setReviewFeedback(null);
    setCarriedHint(null);
    if (targetIndex + 1 >= plan.targets.length) {
      void enterFreeTalk();
      return;
    }

    setTargetIndex((current) => current + 1);
  }

  return {
    phase,
    homeSection,
    inputMode,
    captionsOn,
    voiceState,
    voiceError,
    heardText,
    typedText,
    hintOpen,
    conversationReplies: conversationTurns.map((turn) => turn.answer),
    conversationTurns,
    callId,
    callStartedAt,
    reviewAttempts,
    checkingAnswer,
    choiceAssistOpen,
    finishReason,
    coachLine,
    reviewFeedback,
    carriedHint,
    reviewOutcomes,
    isCallSurface,
    target,
    freeTalkTurn,
    turnLoading,
    speaking,
    progressLabel,
    reviewedCount: Object.keys(reviewOutcomes).length,
    idleSecondsLeft,
    openMyPage: () => setHomeSection("my-page"),
    closeMyPage: () => setHomeSection("home"),
    showIncomingCall: () => setPhase("incoming"),
    startLesson,
    finishClosing: () => setPhase((current) => (current === "closing" ? "complete" : current)),
    declineIncomingCall: () => setPhase("home"),
    answerIncomingCall,
    cancelConnecting,
    isLastTarget: targetIndex + 1 >= plan.targets.length,
    changeInputMode: (mode: InputMode) => {
      stopRecordingQuietly();
      setInputMode(mode);
      setVoiceState("idle");
      setVoiceError(null);
      setHeardText("");
    },
    toggleCaptions: () => setCaptionsOn((current) => !current),
    toggleHint: () => setHintOpen((current) => !current),
    changeTypedText: setTypedText,
    setSpeaking,
    beginOrStopVoice,
    submitTypedAnswer,
    continueReview,
    retryReview: () => {
      setReviewFeedback(null);
      setVoiceState("idle");
      setVoiceError(null);
      setHeardText("");
      setTypedText("");
      setCoachLine("천천히 다시 말해 볼까요?");
    },
    retryVoice: () => {
      void startListening();
    },
    chooseAnswer: submitAnswer,
    toggleChoiceAssist: () => setChoiceAssistOpen((current) => !current),
    endCall: () => {
      generation.current += 1;
      stopRecordingQuietly();
      setTurnLoading(false);
      setFinishReason("stopped");
      setPhase("complete");
    },
    resetCall,
  };
}
