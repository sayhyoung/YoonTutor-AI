import { useEffect, useMemo, useState } from "react";

import type { CallPhase, CallPlan, InputMode } from "@yoon-call/shared";

export type VoiceState = "idle" | "listening" | "review";
export type FinishReason = "completed" | "stopped" | "no-response";

type HomeSection = "home" | "my-page";

const INTRO_LINE =
  "안녕! 오늘은 지난 학습에서 헷갈렸던 표현 세 개만 같이 확인해보자.";

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
      return `짧은 대화 ${freeTalkTurnIndex + 1}/${plan.freeTalk.maxTurns}`;
    }
    return `복습 ${Math.min(targetIndex + 1, plan.targets.length)}/${plan.targets.length}`;
  }, [freeTalkTurnIndex, phase, plan.freeTalk.maxTurns, plan.targets.length, targetIndex]);

  useEffect(() => {
    if (
      phase !== "free-talk" ||
      voiceState !== "idle" ||
      typedText.trim() ||
      choiceAssistOpen
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      setFinishReason("no-response");
      setPhase("complete");
    }, plan.freeTalk.idleStopSeconds * 1000);

    return () => clearTimeout(timeout);
  }, [
    choiceAssistOpen,
    freeTalkTurnIndex,
    phase,
    plan.freeTalk.idleStopSeconds,
    typedText,
    voiceState,
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
  }

  function answerIncomingCall() {
    setPhase("connecting");
    setTimeout(() => setPhase("review"), 650);
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

    if (targetIndex + 1 >= plan.targets.length) {
      setCoachLine(plan.freeTalk.turns[0]!.questionEn);
      setFreeTalkTurnIndex(0);
      setChoiceAssistOpen(false);
      setPhase("free-talk");
      return;
    }

    setCoachLine("정확하게 말했어. 바로 다음 표현으로 넘어가 볼게.");
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
    isCallSurface,
    target,
    freeTalkTurn,
    progressLabel,
    openMyPage: () => setHomeSection("my-page"),
    closeMyPage: () => setHomeSection("home"),
    showIncomingCall: () => setPhase("incoming"),
    declineIncomingCall: () => setPhase("home"),
    answerIncomingCall,
    changeInputMode: setInputMode,
    toggleCaptions: () => setCaptionsOn((current) => !current),
    toggleHint: () => setHintOpen((current) => !current),
    changeTypedText: setTypedText,
    beginOrStopVoice,
    submitTypedAnswer,
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
