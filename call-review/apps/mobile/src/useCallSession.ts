import { useEffect, useMemo, useRef, useState } from "react";

import type { CallPhase, CallPlan, InputMode } from "@yoon-call/shared";

export type VoiceState = "idle" | "listening" | "review";
export type FinishReason = "completed" | "stopped" | "no-response";
export type ReviewFeedback = { kind: "correct" | "retry"; answer: string };
export type ReviewOutcome = ReviewFeedback["kind"];

type HomeSection = "home" | "my-page";

const INTRO_LINE =
  "안녕! 오늘은 지난 학습에서 헷갈렸던 표현 세 개만 같이 확인해보자.";
const QUESTION_SETTLE_MS = 1500;
// Preview only: long enough to read the connection checklist.
const CONNECT_PREVIEW_MS = 1800;

export function useCallSession(plan: CallPlan) {
  const [phase, setPhase] = useState<CallPhase>("home");
  const [homeSection, setHomeSection] = useState<HomeSection>("home");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [targetIndex, setTargetIndex] = useState(0);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [heardText, setHeardText] = useState("");
  const [typedText, setTypedText] = useState("");
  const [hintOpen, setHintOpen] = useState(false);
  const [freeTalkTurnIndex, setFreeTalkTurnIndex] = useState(0);
  const [conversationReplies, setConversationReplies] = useState<string[]>([]);
  const [choiceAssistOpen, setChoiceAssistOpen] = useState(false);
  const [finishReason, setFinishReason] =
    useState<FinishReason>("completed");
  const [coachLine, setCoachLine] = useState(INTRO_LINE);
  const [reviewFeedback, setReviewFeedback] = useState<ReviewFeedback | null>(null);
  // First attempt wins: an item missed once stays on the "다시 보기" list.
  const [reviewOutcomes, setReviewOutcomes] = useState<Record<number, ReviewOutcome>>({});
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(plan.freeTalk.idleStopSeconds);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCallSurface =
    phase === "incoming" ||
    phase === "connecting" ||
    phase === "review" ||
    phase === "free-talk";
  const target = plan.targets[targetIndex];
  const freeTalkTurn =
    plan.freeTalk.turns[freeTalkTurnIndex] ?? plan.freeTalk.turns[0]!;
  const progressLabel = useMemo(() => {
    if (phase === "free-talk") {
      return `질문 ${freeTalkTurnIndex + 1} / ${plan.freeTalk.maxTurns}`;
    }
    return `표현 ${Math.min(targetIndex + 1, plan.targets.length)} / ${plan.targets.length}`;
  }, [freeTalkTurnIndex, phase, plan.freeTalk.maxTurns, plan.targets.length, targetIndex]);

  useEffect(() => {
    // The preview has no TTS. Allow the new question to settle before counting;
    // actual TTS should start this countdown from its playback-complete event.
    if (phase !== "free-talk" || voiceState !== "idle") {
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
  ]);

  function resetCall() {
    setPhase("home");
    setTargetIndex(0);
    setVoiceState("idle");
    setHeardText("");
    setTypedText("");
    setHintOpen(false);
    setFreeTalkTurnIndex(0);
    setConversationReplies([]);
    setChoiceAssistOpen(false);
    setFinishReason("completed");
    setHomeSection("home");
    setCoachLine(INTRO_LINE);
    setReviewFeedback(null);
    setReviewOutcomes({});
    setIdleSecondsLeft(plan.freeTalk.idleStopSeconds);
  }

  function answerIncomingCall() {
    setPhase("connecting");
    connectTimer.current = setTimeout(() => setPhase("review"), CONNECT_PREVIEW_MS);
  }

  function cancelConnecting() {
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = null;
    setPhase("home");
  }

  function beginOrStopVoice() {
    if (voiceState === "idle") {
      setVoiceState("listening");
      setHeardText("");
      return;
    }
    if (voiceState === "listening") {
      const previewText =
        phase === "free-talk"
          ? freeTalkTurn.previewVoiceAnswer
          : target?.answerEn ?? "";
      setHeardText(previewText);
      setVoiceState("review");
      return;
    }
    submitAnswer(heardText);
  }

  function submitTypedAnswer() {
    const value = typedText.trim();
    if (!value) return;
    submitAnswer(value);
  }

  function submitAnswer(value: string) {
    if (!value.trim()) return;
    setHintOpen(false);
    setHeardText("");
    setTypedText("");
    setVoiceState("idle");

    if (phase === "free-talk") {
      setConversationReplies((current) => [...current, value]);

      if (
        freeTalkTurnIndex + 1 >= plan.freeTalk.maxTurns ||
        freeTalkTurnIndex + 1 >= plan.freeTalk.turns.length
      ) {
        setFinishReason("completed");
        setPhase("complete");
        return;
      }

      const nextTurnIndex = freeTalkTurnIndex + 1;
      const nextTurn = plan.freeTalk.turns[nextTurnIndex];
      if (!nextTurn) {
        setFinishReason("completed");
        setPhase("complete");
        return;
      }
      setFreeTalkTurnIndex(nextTurnIndex);
      setChoiceAssistOpen(false);
      setCoachLine(nextTurn.questionEn);
      return;
    }

    const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const correct = normalize(value) === normalize(target?.answerEn ?? "");
    setReviewFeedback({ kind: correct ? "correct" : "retry", answer: value });
    setReviewOutcomes((current) =>
      current[targetIndex] ? current : { ...current, [targetIndex]: correct ? "correct" : "retry" },
    );
    setCoachLine(correct ? "좋아요! 아주 자연스러워요." : "괜찮아요. 같이 다시 볼까요?");
  }

  function continueReview() {
    setReviewFeedback(null);
    if (targetIndex + 1 >= plan.targets.length) {
      setCoachLine(plan.freeTalk.turns[0]!.questionEn);
      setFreeTalkTurnIndex(0);
      setChoiceAssistOpen(false);
      setPhase("free-talk");
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
    heardText,
    typedText,
    hintOpen,
    conversationReplies,
    choiceAssistOpen,
    finishReason,
    coachLine,
    reviewFeedback,
    reviewOutcomes,
    isCallSurface,
    target,
    freeTalkTurn,
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
      setInputMode(mode);
      setVoiceState("idle");
      setHeardText("");
    },
    toggleCaptions: () => setCaptionsOn((current) => !current),
    toggleHint: () => setHintOpen((current) => !current),
    changeTypedText: setTypedText,
    beginOrStopVoice,
    submitTypedAnswer,
    continueReview,
    retryReview: () => {
      setReviewFeedback(null);
      setVoiceState("idle");
      setHeardText("");
      setTypedText("");
      setCoachLine("천천히 다시 말해 볼까요?");
    },
    retryVoice: () => {
      setHeardText("");
      setVoiceState("listening");
    },
    chooseAnswer: submitAnswer,
    toggleChoiceAssist: () => setChoiceAssistOpen((current) => !current),
    endCall: () => {
      setFinishReason("stopped");
      setPhase("complete");
    },
    resetCall,
  };
}
