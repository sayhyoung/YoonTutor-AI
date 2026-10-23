import { useEffect, useMemo, useRef, useState } from "react";

import type { CallPhase, CallPlan, ConversationTurn, InputMode } from "@yoon-call/shared";
import { FREE_TALK_EXPRESSIONS, gradeReviewAnswer } from "@yoon-call/shared";

import type { FreeTalkTurnRequest, GeneratedTurn } from "./callReviewApi";

export type VoiceState = "idle" | "preparing" | "listening" | "transcribing" | "review";
export type FinishReason = "completed" | "stopped" | "no-response";
// message: 틀렸을 때 보여 줄 위로 멘트(매번 다르게 고른다).
export type ReviewFeedback = { kind: "correct" | "retry"; answer: string; message?: string };
export type ReviewOutcome = ReviewFeedback["kind"];

export type ConversationTurnRecord = { questionEn: string; answer: string };

// 실회원 모드에서만 주입된다. 없으면(프리뷰) 템플릿 질문과 가짜 인식 결과를 쓴다.
export type SessionServices = {
  generateTurn?: (request: FreeTalkTurnRequest) => Promise<GeneratedTurn | null>;
  voice?: {
    start: () => Promise<void>;
    stop: () => Promise<string | null>;
    transcribe: (uri: string) => Promise<string>;
  };
  // 읽어 줄 질문이 정해지면 미리 받아 둔다(첫 대화 질문은 복습 중에 미리 만들어진다).
  prepareSpeech?: (questionEn: string) => void;
};

// 복습 표현을 틀렸을 때 고르는 멘트. 같은 멘트가 연달아 나오지 않게 한다.
export const RETRY_MESSAGES = [
  "아, 살짝 아쉬워요",
  "거의 맞혔어요",
  "비슷하긴 한데 정답은 아니에요",
  "조금만 더 하면 돼요",
  "아깝다! 한 끗 차이예요",
  "좋은 시도였어요",
  "거의 다 왔어요",
] as const;

export function pickRetryMessage(previous?: string, random: () => number = Math.random): string {
  const choices = RETRY_MESSAGES.filter((message) => message !== previous);
  return choices[Math.floor(random() * choices.length)] ?? RETRY_MESSAGES[0];
}

// 축약형·대소문자·문장부호만 다르게 말했을 때(정답 처리) 고르는 멘트.
export const CLOSE_MESSAGES = [
  "네, 잘 알고 있네요",
  "대체로 맞았어요",
  "거의 완벽해요",
  "좋아요, 맞았어요",
  "뜻이 딱 맞아요",
] as const;

export function pickCloseMessage(previous?: string, random: () => number = Math.random): string {
  const choices = CLOSE_MESSAGES.filter((message) => message !== previous);
  return choices[Math.floor(random() * choices.length)] ?? CLOSE_MESSAGES[0];
}

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
  // First attempt wins: an item missed once stays on the "다시 보기" list.
  const [reviewOutcomes, setReviewOutcomes] = useState<Record<number, ReviewOutcome>>({});
  const [firstAnswers, setFirstAnswers] = useState<Record<number, string>>({});
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
    phase === "review" ||
    phase === "free-talk";
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
    setReviewOutcomes({});
    setFirstAnswers({});
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
      if (turn) services.prepareSpeech?.(turn.questionEn);
    });
    connectTimer.current = setTimeout(() => setPhase("review"), CONNECT_PREVIEW_MS);
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
      setFinishReason("completed");
      setPhase("complete");
      return;
    }
    const current = generation.current;
    setTurnLoading(true);
    const generated = await requestTurn(nextTurnIndex, history);
    if (current !== generation.current) return;
    setTurnLoading(false);
    showTurn(nextTurnIndex, generated ?? fallback);
  }

  function submitAnswer(value: string) {
    if (!value.trim()) return;
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

    const grade = gradeReviewAnswer(value, target?.answerEn ?? "");
    const correct = grade !== "wrong";
    const message =
      grade === "exact"
        ? undefined
        : grade === "close"
          ? pickCloseMessage(lastRetryMessage.current)
          : pickRetryMessage(lastRetryMessage.current);
    if (message) lastRetryMessage.current = message;
    setReviewFeedback({ kind: correct ? "correct" : "retry", answer: value, ...(message ? { message } : {}) });
    setReviewOutcomes((current) =>
      current[targetIndex] ? current : { ...current, [targetIndex]: correct ? "correct" : "retry" },
    );
    setFirstAnswers((current) => (targetIndex in current ? current : { ...current, [targetIndex]: value }));
    setCoachLine(correct ? "좋아요! 아주 자연스러워요." : "괜찮아요. 같이 다시 볼까요?");
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
    setTurnLoading(false);
    const opening = prepared ?? plan.freeTalk.turns[0]!;
    talkTopic.current = opening.relatedExpression || undefined;
    showTurn(0, opening);
  }

  function continueReview() {
    setReviewFeedback(null);
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
    firstAnswers,
    choiceAssistOpen,
    finishReason,
    coachLine,
    reviewFeedback,
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
