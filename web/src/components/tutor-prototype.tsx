"use client";

import { useEffect, useRef, useState } from "react";

import { Koko } from "@/components/koko";
import { demoSessions, demoStudent } from "@/lib/mock-data";
import { getLearningSource, getWrongAnswerItems } from "@/lib/learning/provider";
import { calculateSessionScore, scoreStatus } from "@/lib/quiz-engine";
import { buildVisibleSessions } from "@/lib/session-utils";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  finalizeQuizSession,
  loadAllSessions,
  loadGamification,
  loadQuizSessions,
  readLocalSessions,
} from "@/lib/firebase/firestore";
import {
  emptyGamification,
  levelFromXp,
  levelProgress,
  nextStreak,
  starsForSession,
  starsForStatus,
  todayKst,
  xpForSession,
  type GamificationState,
} from "@/lib/gamification";
import type {
  AppUser,
  Attempt,
  ChatMessage,
  LearningItem,
  MasteryStatus,
  QuizSession,
  SessionResult,
} from "@/lib/types";

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STATUS_ORDER: MasteryStatus[] = ["Perfect", "Good", "Not mastered"];

type ActiveView = "home" | "coach" | "report" | "teacher";
type PersistenceMode = "idle" | "local" | "firestore" | "loading" | "error";

type TutorPrototypeProps = {
  appUser: AppUser;
  onLogout: () => void;
};

export function TutorPrototype({ appUser, onLogout }: TutorPrototypeProps) {
  const isTeacher = appUser.role === "teacher";
  const studentId = appUser.studentId ?? demoStudent.id;

  const [activeView, setActiveView] = useState<ActiveView>(isTeacher ? "teacher" : "home");
  const [learningItems, setLearningItems] = useState<LearningItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [coachComment, setCoachComment] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  // 저장/연결 상태는 학습자 화면에 표시하지 않지만, 내부 저장 흐름을 위해 setter는 유지.
  const [, setSaveMode] = useState<PersistenceMode>("idle");
  const [, setPersistenceMode] = useState<PersistenceMode>(
    isFirebaseConfigured() ? "loading" : "local",
  );
  const [storedSessions, setStoredSessions] = useState<QuizSession[]>(() => readLocalSessions());
  // AI 튜터 대화 히스토리(서버 전달용). 화면 messages와 별개로 role/content만 보관.
  const [apiMessages, setApiMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [tutorStarting, setTutorStarting] = useState(false);
  // 음성 입력(STT): 마이크 녹음 → /api/stt(Whisper) → 답 입력창 채움.
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // 세션 ID는 학습 시작 시 한 번 만들고 완료/재시도 동안 고정한다.
  const sessionIdRef = useRef<string | null>(null);
  const isFinishingRef = useRef(false);
  // 게이미피케이션(별/스트릭) 상태.
  const [gamification, setGamification] = useState<GamificationState | null>(null);
  // 콤보(Perfect/Good 연속). 저장하지 않고 세션 내 로컬 표시용.
  const [combo, setCombo] = useState(0);
  // 완료 화면 연출용: 이번 세션 획득 별 / 새 스트릭 / 최고기록 갱신 여부.
  const [sessionReward, setSessionReward] = useState<{
    earnedStars: number;
    earnedXp: number;
    previousLevel: number;
    newLevel: number;
    streakCurrent: number;
    isBestStreak: boolean;
  } | null>(null);

  useEffect(() => {
    if (isTeacher) return;
    let mounted = true;
    void loadGamification(studentId).then((g) => {
      if (mounted && g) setGamification(g);
    });
    return () => {
      mounted = false;
    };
  }, [isTeacher, studentId]);

  useEffect(() => {
    if (isTeacher) return;

    let isMounted = true;

    void getWrongAnswerItems(studentId)
      .then((items) => {
        if (!isMounted) return;
        setLearningItems(items);
        setItemsLoaded(true);
        // 홈에서 '학습 시작하기'를 누르면 코칭이 시작된다(startLearning).
      })
      .catch(() => {
        if (!isMounted) return;
        setItemsLoaded(true);
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: "학습 문항을 불러오지 못했어. 잠시 후 다시 시도해줘.",
            createdAt: nowIso(),
          },
        ]);
      });

    return () => {
      isMounted = false;
    };
  }, [isTeacher, studentId]);

  useEffect(() => {
    let isMounted = true;

    async function syncSessions() {
      const result = isTeacher
        ? await loadAllSessions()
        : await loadQuizSessions(studentId);
      if (!isMounted) return;
      setStoredSessions(result.sessions);
      setPersistenceMode(result.mode);
    }

    void syncSessions().catch(() => {
      if (!isMounted) return;
      setPersistenceMode("error");
      setStoredSessions(readLocalSessions());
    });

    return () => {
      isMounted = false;
    };
  }, [isTeacher, studentId]);

  const learningSource = getLearningSource();
  const sessions = buildVisibleSessions(
    storedSessions,
    demoSessions,
    learningSource,
  );
  const currentPreviewSession: QuizSession | null =
    results.length > 0
      ? {
          id: "current-session-preview",
          uid: appUser.uid,
          studentId,
          memberId: appUser.memberId,
          studentName: appUser.displayName,
          source: learningSource,
          totalItems: learningItems.length,
          completedItems: results.length,
          score: calculateSessionScore(results),
          results,
          createdAt: messages[0]?.createdAt ?? nowIso(),
        }
      : null;
  const reportSessions = currentPreviewSession ? [currentPreviewSession, ...sessions] : sessions;
  const progress =
    learningItems.length > 0
      ? Math.round((results.length / learningItems.length) * 100)
      : 0;
  const score = calculateSessionScore(results);
  const perfectCount = results.filter((item) => item.status === "Perfect").length;
  const goodCount = results.filter((item) => item.status === "Good").length;
  const needsReviewCount = results.filter((item) => item.status === "Not mastered").length;

  type TutorTurn = {
    reply: string;
    raw?: string;
    status?: MasteryStatus;
    countsAsAttempt: boolean;
    attemptNumber?: number;
    nextAttemptCount?: number;
    currentItemIndex: number;
    nextItemIndex: number;
    done: boolean;
  };

  // 서버가 결정론적으로 채점·시도 횟수·다음 문항을 확정하고,
  // AI는 그 판정에 맞는 자연스러운 피드백과 문제 문장만 생성한다.
  async function callTutor(
    items: LearningItem[],
    msgs: { role: "user" | "assistant"; content: string }[],
    turn?: {
      currentItemIndex: number;
      previousAttemptCount: number;
      answer: string;
    },
  ): Promise<TutorTurn> {
    const res = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: appUser.displayName,
        items,
        messages: msgs,
        ...turn,
      }),
    });
    return (await res.json()) as TutorTurn;
  }

  // 세션 시작: AI 인사 + 1번 문제(한국어 뜻 포함)를 받아 첫 메시지로 표시.
  async function startTutor(items: LearningItem[]) {
    setCombo(0);
    if (!items.length) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "오늘 복습할 오답 문항이 없어. 잠시 후 다시 확인해줘.",
          createdAt: nowIso(),
        },
      ]);
      return;
    }
    setTutorStarting(true);
    try {
      const data = await callTutor(items, []);
      const raw = data.raw || data.reply;
      setApiMessages([{ role: "assistant", content: raw }]);
      setMessages([
        { id: "welcome", role: "assistant", content: data.reply, createdAt: nowIso() },
      ]);
    } finally {
      setTutorStarting(false);
    }
  }

  // [DONE]이 아직 안 푼 문항보다 먼저 오면 남은 문항을 Not mastered로 채움(POC _pad_missing_results).
  function padResults(base: SessionResult[]): SessionResult[] {
    const out = [...base];
    for (let i = base.length; i < learningItems.length; i++) {
      const it = learningItems[i];
      out.push({
        itemId: it.id,
        sourceType: it.sourceType,
        sourceLabel: it.sourceLabel,
        question: it.meaningKo || it.promptKo,
        answer: it.answerEn,
        status: "Not mastered",
        attempts: 3,
      });
    }
    return out;
  }

  function ensureSessionId(): string {
    if (!sessionIdRef.current) {
      sessionIdRef.current = makeId("session");
    }
    return sessionIdRef.current;
  }

  // 홈 → 코칭 진입: 코칭룸으로 이동하고, 대화가 비어 있으면 튜터를 시작한다.
  function startLearning() {
    setActiveView("coach");
    if (messages.length === 0 && !tutorStarting && learningItems.length > 0) {
      ensureSessionId();
      void startTutor(learningItems);
    }
  }

  // 마이크 토글: 녹음 시작/정지. 정지 시 오디오를 /api/stt로 보내 영어로 변환해 입력창에 채움.
  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      alert("이 브라우저에선 마이크 입력을 지원하지 않아.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setIsTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "recording.webm");
          const res = await fetch("/api/stt", { method: "POST", body: fd });
          const data = (await res.json()) as { text?: string; error?: string };
          if (data.text) {
            setAnswer((prev) => (prev.trim() ? `${prev.trim()} ${data.text}` : data.text!));
          }
        } catch {
          // 변환 실패는 조용히 무시(사용자가 다시 시도 가능)
        } finally {
          setIsTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      alert("마이크를 사용할 수 없어. 브라우저 마이크 권한을 확인해줘.");
    }
  }

  async function submitAnswer() {
    const trimmed = answer.trim();
    if (
      !trimmed ||
      isSending ||
      isFinishing ||
      isFinished ||
      tutorStarting ||
      learningItems.length === 0
    ) {
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: makeId("student"), role: "student", content: trimmed, createdAt: nowIso() },
    ]);
    setAnswer("");
    setIsSending(true);

    const nextApi = [...apiMessages, { role: "user" as const, content: trimmed }];
    try {
      const data = await callTutor(learningItems, nextApi, {
        currentItemIndex: currentIndex,
        previousAttemptCount: attemptCount,
        answer: trimmed,
      });
      const raw = data.raw || data.reply;
      setApiMessages([...nextApi, { role: "assistant", content: raw }]);

      // 문항 확정 시 획득 별 + 콤보(표시용). Perfect/Good 연속이면 콤보 증가, 재복습이면 리셋.
      let earnedStars: number | undefined;
      let comboAtMsg: number | undefined;
      if (data.status) {
        earnedStars = starsForStatus(data.status);
        const nextCombo = data.status === "Perfect" || data.status === "Good" ? combo + 1 : 0;
        comboAtMsg = nextCombo;
        setCombo(nextCombo);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: makeId("assistant"),
          role: "assistant",
          content: data.reply,
          status: data.status,
          earnedStars,
          combo: comboAtMsg,
          createdAt: nowIso(),
        },
      ]);
      handleTurn(data, trimmed);
    } finally {
      setIsSending(false);
    }
  }

  // 서버의 결정론 판정으로 현재 문항 결과와 다음 문항을 확정한다.
  function handleTurn(data: TutorTurn, submittedAnswer: string) {
    const item = learningItems[currentIndex];
    const attemptNumber =
      data.attemptNumber ??
      (data.countsAsAttempt ? attemptCount + 1 : attemptCount);

    const nextAttempts: Attempt[] = [
      ...attempts,
      {
        id: makeId("attempt"),
        uid: appUser.uid,
        sessionId: ensureSessionId(),
        itemId: item?.id ?? "",
        answer: submittedAnswer,
        feedback: data.reply,
        status: data.status,
        countsAsAttempt: data.countsAsAttempt,
        attemptNumber,
        createdAt: nowIso(),
      },
    ];
    setAttempts(nextAttempts);

    if (data.status && item) {
      const nextResults: SessionResult[] = [
        ...results,
        {
          itemId: item.id,
          sourceType: item.sourceType,
          sourceLabel: item.sourceLabel,
          question: item.meaningKo || item.promptKo,
          answer: item.answerEn,
          status: data.status,
          attempts: attemptNumber,
        },
      ];
      const nextIndex = data.nextItemIndex;
      setResults(nextResults);
      setCurrentIndex(nextIndex);
      setAttemptCount(0);
      if (data.done || nextIndex >= learningItems.length) {
        void finishSession(padResults(nextResults), nextAttempts);
      }
      return;
    }

    // 힌트는 횟수를 늘리지 않고, 실제 오답 제출만 시도 횟수에 반영한다.
    setCurrentIndex(data.nextItemIndex);
    setAttemptCount(data.nextAttemptCount ?? attemptNumber);
    if (data.done) {
      void finishSession(padResults(results), nextAttempts);
    }
  }

  async function finishSession(nextResults: SessionResult[], nextAttempts: Attempt[]) {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    setIsFinishing(true);

    const sessionId = ensureSessionId();
    const completedAt = nowIso();
    const prevBest = gamification?.streak.best ?? 0;
    const previousLevel = gamification?.level ?? 1;
    const earnedStars = starsForSession(nextResults);
    const earnedXp = xpForSession(nextResults);
    const projectedStreak = nextStreak(
      (gamification ?? emptyGamification()).streak,
      todayKst(),
    );
    const projectedReward = {
      earnedStars,
      earnedXp,
      previousLevel,
      newLevel: levelFromXp((gamification?.xp ?? 0) + earnedXp),
      streakCurrent: projectedStreak.current,
      isBestStreak: projectedStreak.best > prevBest,
    };

    // POC generate_final_report 대응: 종료 시 AI 코치 총평을 받아 화면 표시 + 세션에 저장.
    setReportLoading(true);
    let comment = "";
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: appUser.displayName,
          results: nextResults,
          gamification: projectedReward,
        }),
      });
      if (res.ok) {
        comment = ((await res.json()) as { comment?: string }).comment ?? "";
      }
    } catch {
      // 총평 실패는 치명적이지 않음 — 코멘트 없이 진행.
    }
    setCoachComment(comment);
    setReportLoading(false);

    const session: QuizSession = {
      id: sessionId,
      uid: appUser.uid,
      studentId,
      memberId: appUser.memberId,
      studentName: appUser.displayName,
      source: learningSource,
      totalItems: learningItems.length,
      completedItems: nextResults.length,
      score: calculateSessionScore(nextResults),
      results: nextResults,
      coachComment: comment || undefined,
      createdAt: messages[0]?.createdAt ?? completedAt,
      completedAt,
    };

    // 세션·보상 원장·게이미피케이션을 안정적인 sessionId로 한 번만 확정한다.
    try {
      const finalized = await finalizeQuizSession(session, nextAttempts);
      setGamification(finalized.gamification);
      setSessionReward({
        earnedStars: finalized.earnedStars,
        earnedXp: finalized.earnedXp,
        previousLevel: finalized.previousLevel,
        newLevel: finalized.newLevel,
        streakCurrent: finalized.gamification.streak.current,
        isBestStreak: finalized.gamification.streak.best > prevBest,
      });
      setSaveMode(finalized.mode);
      setPersistenceMode(finalized.mode);
      const refreshed = await loadQuizSessions(studentId);
      setStoredSessions(refreshed.sessions);
      setPersistenceMode(refreshed.mode);
      setIsFinished(true);
    } catch {
      // 저장소 용량 등 로컬 fallback 자체가 실패해도 완료 화면은 유지한다.
      setSessionReward(projectedReward);
      setSaveMode("error");
      setPersistenceMode("error");
      setIsFinished(true);
    } finally {
      setIsFinishing(false);
      isFinishingRef.current = false;
    }
  }

  function restartSession() {
    setAnswer("");
    setCurrentIndex(0);
    setAttemptCount(0);
    setAttempts([]);
    setResults([]);
    setApiMessages([]);
    setMessages([]);
    setIsFinishing(false);
    setIsFinished(false);
    sessionIdRef.current = makeId("session");
    isFinishingRef.current = false;
    setCoachComment("");
    setReportLoading(false);
    setSaveMode("idle");
    setSessionReward(null);
    // POC처럼 AI 인사 + 1번 문제부터 다시 시작.
    void startTutor(learningItems);
  }

  // ===== 교사: 데스크톱 대시보드 =====
  if (isTeacher) {
    return (
      <div className="app-shell">
        <aside className="sidebar">
          <div>
            <div className="brand-mark">Y</div>
            <h1 className="brand-title">윤선생 AI 코치</h1>
            <p className="brand-subtitle">교사 대시보드</p>
          </div>
          <div className="side-section">
            <div className="side-label">현재 사용자</div>
            <div className="connection">
              <span>
                {appUser.displayName}
                {appUser.memberId ? ` · ${appUser.memberId}` : ""}
              </span>
              <span>교사</span>
            </div>
          </div>
          <div className="side-section">
            <button className="side-button" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <div>
              <div className="eyebrow">YOON&apos;S · 교사</div>
              <h2 className="page-title">학습 운영 대시보드</h2>
              <p className="page-copy">담당 회원의 학습 현황과 세션 결과를 확인합니다.</p>
            </div>
          </header>
          <TeacherDashboard sessions={reportSessions} />
        </main>
      </div>
    );
  }

  // ===== 학생: 모바일 폰 UI =====
  return (
    <div className="phone-shell">
      <div className="phone">
        {activeView === "coach" ? (
          <>
            <div className="chat-head">
              <button className="chat-back" onClick={() => setActiveView("home")} aria-label="뒤로">
                ‹
              </button>
              <div className="chat-head-title">
                <div className="chat-head-name">오답 복습</div>
                <div className="chat-head-sub">코코와 함께하는 보충학습</div>
              </div>
              <button className="chat-restart" onClick={restartSession}>
                다시
              </button>
            </div>
            <div className="chat-progress">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span>
                {results.length}/{learningItems.length}
              </span>
            </div>

            {isFinished ? (
              <div className="phone-body">
                <SessionComplete
                  score={score}
                  perfectCount={perfectCount}
                  goodCount={goodCount}
                  needsReviewCount={needsReviewCount}
                  results={results}
                  coachComment={coachComment}
                  reportLoading={reportLoading}
                  reward={sessionReward}
                  onRestart={restartSession}
                  onViewReport={() => setActiveView("report")}
                />
              </div>
            ) : itemsLoaded && learningItems.length === 0 ? (
              <div className="phone-body">
                <div className="empty-celebration">
                  <Koko size={104} float />
                  <h3 className="panel-title" style={{ marginTop: 14 }}>
                    오늘 복습할 오답이 없어!
                  </h3>
                  <p className="panel-note">지난 학습을 완벽하게 해냈다는 뜻이야 🎉</p>
                </div>
              </div>
            ) : (
              <>
                <div className="chat-feed">
                  {messages.map((message) =>
                    message.role === "assistant" ? (
                      <div key={message.id} className="msg-row">
                        <span className="msg-avatar">
                          <Koko
                            size={32}
                            mood={
                              message.status === "Not mastered"
                                ? "cheer"
                                : message.status
                                  ? "happy"
                                  : "default"
                            }
                          />
                        </span>
                        <div className="message assistant">
                          {message.content}
                          {message.status ? (
                            <div className="reward-row">
                              <span className="star-earned">
                                ⭐×{message.earnedStars ?? starsForStatus(message.status)}{" "}
                                {rewardLabel(message.status)}
                              </span>
                              {message.combo && message.combo >= 2 ? (
                                <span className="combo-badge">🔥 {message.combo}연속!</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div key={message.id} className="message student">
                        {message.content}
                      </div>
                    ),
                  )}
                  {isSending || isFinishing ? (
                    <div className="msg-row">
                      <span className="msg-avatar">
                        <Koko size={32} />
                      </span>
                      <div className="message assistant typing">
                        {isFinishing
                          ? "오늘 결과를 정리하는 중…"
                          : "코코가 생각 중…"}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="composer">
                  <button
                    className={`button mic-button ${isRecording ? "recording" : ""}`}
                    onClick={toggleRecording}
                    disabled={isSending || isTranscribing || isFinishing}
                    title="음성으로 답하기"
                    aria-label="음성으로 답하기"
                  >
                    {isRecording ? "●" : isTranscribing ? "…" : "🎤"}
                  </button>
                  <input
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitAnswer();
                    }}
                    placeholder="영어로 답하거나 마이크를 눌러봐"
                    disabled={isSending || isTranscribing || isFinishing}
                  />
                  <button
                    className="button primary"
                    onClick={submitAnswer}
                    disabled={isSending || isTranscribing || isFinishing}
                  >
                    제출
                  </button>
                </div>
              </>
            )}
          </>
        ) : activeView === "report" ? (
          <>
            <div className="phone-top">
              <h2 className="page-title">나의 학습 리포트</h2>
              <p className="page-copy" style={{ marginTop: 4 }}>
                세션별 학습 내역과 성취도를 확인해요.
              </p>
            </div>
            <div className="phone-body">
              <StudentReport sessions={reportSessions} />
            </div>
          </>
        ) : (
          <HomeView
            name={appUser.displayName}
            items={learningItems}
            itemsLoaded={itemsLoaded}
            gamification={gamification}
            onStart={startLearning}
          />
        )}

        <nav className="bottom-nav">
          <button
            className={activeView === "home" ? "active" : ""}
            onClick={() => setActiveView("home")}
          >
            <span className="nav-ico">🏠</span>홈
          </button>
          <button className={activeView === "coach" ? "active" : ""} onClick={startLearning}>
            <span className="nav-ico">📖</span>학습
          </button>
          <button
            className={activeView === "report" ? "active" : ""}
            onClick={() => setActiveView("report")}
          >
            <span className="nav-ico">📊</span>리포트
          </button>
          <button onClick={onLogout}>
            <span className="nav-ico">🚪</span>로그아웃
          </button>
        </nav>
      </div>
    </div>
  );
}

// 학생 홈 — 인사 + 통계(비주얼) + 코코 말풍선 + 오늘의 보충학습 목록 + 시작 버튼.
function HomeView({
  name,
  items,
  itemsLoaded,
  gamification,
  onStart,
}: {
  name: string;
  items: LearningItem[];
  itemsLoaded: boolean;
  gamification: GamificationState | null;
  onStart: () => void;
}) {
  const streakDays = gamification?.streak.current ?? 0;
  const starCount = gamification?.stars ?? 0;
  const progress = levelProgress(gamification?.xp ?? 0);
  const today = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  const initial = name?.trim()?.slice(0, 2) || "나";

  return (
    <div className="phone-body home">
      <div className="home-greet">
        <div>
          <div className="home-date">{today}</div>
          <h2 className="home-hello">
            {name}, 안녕! <span style={{ display: "inline-block" }}>👋</span>
          </h2>
        </div>
        <div className="home-avatar">{initial}</div>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-ico" style={{ background: "#FEF0E0" }}>
            🔥
          </span>
          <div>
            <div className="stat-num">{streakDays}일</div>
            <div className="stat-cap">{streakDays > 0 ? "연속 학습" : "오늘부터 시작!"}</div>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-ico" style={{ background: "#FFF4DE" }}>
            ⭐
          </span>
          <div>
            <div className="stat-num">{starCount}개</div>
            <div className="stat-cap">모은 별</div>
          </div>
        </div>
      </div>

      <div className="level-card">
        <div className="level-head">
          <span>레벨 {progress.level}</span>
          <span>{progress.xp} XP</span>
        </div>
        <div
          className="level-track"
          role="progressbar"
          aria-label={`레벨 ${progress.level} 진행률`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
        >
          <span
            className="level-fill"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="level-meta">
          {progress.nextThreshold === null
            ? "최고 레벨 달성!"
            : `다음 레벨까지 ${progress.xpNeeded - progress.xpIntoLevel} XP`}
        </div>
      </div>

      <div className="koko-stage">
        <Koko size={80} float />
        <div>
          <div className="koko-bubble">
            {items.length
              ? `오늘은 ${items.length}문제만 복습하면 끝! 나랑 같이 해볼까? 😊`
              : "오늘은 복습할 오답이 없어. 아주 잘하고 있어! 🎉"}
          </div>
          <div className="koko-name">🤖 AI 코치 코코</div>
        </div>
      </div>

      <div className="today-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="panel-title">오늘의 보충학습</div>
          <span className="today-badge">약 {Math.max(1, Math.ceil(items.length * 1.2))}분</span>
        </div>
        <p className="panel-note" style={{ marginTop: 3 }}>
          지난 학습에서 틀린 문제들을 모았어요
        </p>

        <div className="item-list" style={{ marginTop: 14 }}>
          {!itemsLoaded ? (
            <div className="empty-state">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="empty-state">복습할 오답이 없어요.</div>
          ) : (
            items.slice(0, 5).map((it) => (
              <div className="item-row" key={it.id}>
                <span className={`item-badge cat-${it.sourceType}`}>{it.sourceLabel}</span>
                <div>
                  <p className="item-title">
                    {it.answerEn}
                    {it.meaningKo ? ` · ${it.meaningKo}` : ""}
                  </p>
                  <p className="item-sub">{it.unitName}</p>
                </div>
                <span className="dot-warn" />
              </div>
            ))
          )}
        </div>

        <button
          className="button primary"
          style={{ width: "100%", marginTop: 16, padding: 16, fontSize: "1.05rem" }}
          onClick={onStart}
          disabled={itemsLoaded && items.length === 0}
        >
          학습 시작하기 →
        </button>
      </div>
    </div>
  );
}

function SessionComplete({
  score,
  perfectCount,
  goodCount,
  needsReviewCount,
  results,
  coachComment,
  reportLoading,
  reward,
  onRestart,
  onViewReport,
}: {
  score: number;
  perfectCount: number;
  goodCount: number;
  needsReviewCount: number;
  results: SessionResult[];
  coachComment: string;
  reportLoading: boolean;
  reward: {
    earnedStars: number;
    earnedXp: number;
    previousLevel: number;
    newLevel: number;
    streakCurrent: number;
    isBestStreak: boolean;
  } | null;
  onRestart: () => void;
  onViewReport: () => void;
}) {
  const earned = reward?.earnedStars ?? 0;
  const [shownStars, setShownStars] = useState(0);

  // 별 카운트업 0 → earned (~600ms).
  useEffect(() => {
    if (earned <= 0) return; // 초기값이 0이라 별도 설정 불필요
    let raf = 0;
    const start = performance.now();
    const dur = 600;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShownStars(Math.round(p * earned));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [earned]);

  // 완료 화면 진입 시 컨페티 1회(클라이언트에서만 로드, SSR 안전).
  useEffect(() => {
    let cancelled = false;
    import("canvas-confetti")
      .then((m) => {
        if (!cancelled) m.default({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="completion">
      <div className="completion-head">
        <Koko size={72} float mood="celebrate" />
        <div className="completion-badge">🏆</div>
        <h3 className="panel-title">학습 완료!</h3>
        <p className="panel-note">오늘의 복습 결과를 확인해봐</p>
      </div>

      {reward ? (
        <div className="completion-reward">
          <div className="reward-stars">⭐ +{shownStars} · +{reward.earnedXp} XP</div>
          {reward.newLevel > reward.previousLevel ? (
            <div className="reward-level">🎉 레벨 {reward.newLevel} 달성!</div>
          ) : null}
          <div className="reward-streak">
            🔥 {reward.streakCurrent}일 연속이야!
            {reward.isBestStreak ? <span className="reward-best"> 최고 기록 경신!</span> : null}
          </div>
        </div>
      ) : null}

      <div className="metric-grid four">
        <Metric label="최종 점수" value={`${score}점`} />
        <Metric label="Perfect" value={`${perfectCount}`} />
        <Metric label="Good" value={`${goodCount}`} />
        <Metric label="재복습" value={`${needsReviewCount}`} />
      </div>

      <div className="completion-table">
        <table className="table">
          <thead>
            <tr>
              <th>영역</th>
              <th>학습 내용</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.itemId}>
                <td>{result.sourceLabel}</td>
                <td>
                  {result.answer}
                  {result.question ? ` : ${result.question}` : ""}
                </td>
                <td>
                  <StatusText status={result.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="coach-comment">
        <div className="coach-comment-title">🦉 AI 코치 피드백</div>
        <p>
          {reportLoading
            ? "AI 코치가 분석 중…"
            : coachComment || "이번엔 코치 피드백을 불러오지 못했어. 결과표를 참고해줘."}
        </p>
      </div>

      <div className="completion-actions">
        <button className="button" onClick={onRestart}>
          다시 복습
        </button>
        <button className="button primary" onClick={onViewReport}>
          내 학습 리포트 보기
        </button>
      </div>
    </div>
  );
}

function StudentReport({ sessions }: { sessions: QuizSession[] }) {
  const completedSessions = sessions.filter((session) => session.results.length > 0);
  const average =
    completedSessions.length > 0
      ? Math.round(completedSessions.reduce((sum, session) => sum + session.score, 0) / completedSessions.length)
      : 0;
  const bestScore = completedSessions.reduce((max, session) => Math.max(max, session.score), 0);
  const totalItems = completedSessions.reduce((sum, session) => sum + session.completedItems, 0);
  const reviewItems = completedSessions.flatMap((session) =>
    session.results.filter((result) => result.status === "Not mastered"),
  );
  const latestComment = sessions.find((session) => session.coachComment)?.coachComment ?? "";

  return (
    <section className="report-view">
      <div className="panel">
        <div className="section-body">
          <div className="metric-grid four">
            <Metric label="학습 세션" value={`${completedSessions.length}`} />
            <Metric label="평균 점수" value={`${average}점`} />
            <Metric label="최고 점수" value={`${bestScore}점`} />
            <Metric label="누적 문항" value={`${totalItems}`} />
          </div>
        </div>
      </div>

      {latestComment ? (
        <div className="panel">
          <div className="coach-comment">
            <div className="coach-comment-title">🦉 최근 AI 코치 피드백</div>
            <p>{latestComment}</p>
          </div>
        </div>
      ) : null}

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">성취도 추이</h3>
              <p className="panel-note">최근 세션 점수 변화</p>
            </div>
          </div>
          <div className="section-body">
            <ScoreTrendChart sessions={completedSessions} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">성취도 분포</h3>
              <p className="panel-note">Perfect, Good, 재복습 비율</p>
            </div>
          </div>
          <div className="section-body">
            <StatusDonutChart sessions={completedSessions} />
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">영역별 성취</h3>
              <p className="panel-note">단어, 문장, 평가 문항별 결과 누적</p>
            </div>
          </div>
          <div className="section-body">
            <SourceBreakdownChart sessions={completedSessions} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">재복습 목록</h3>
              <p className="panel-note">다음 세션에서 다시 풀 문항</p>
            </div>
          </div>
          <div className="section-body item-list">
            {reviewItems.length === 0 ? (
              <div className="empty-state">현재 재복습 대상 문항이 없습니다.</div>
            ) : (
              reviewItems.map((item) => (
                <div className="item-row" key={`${item.itemId}-${item.question}`}>
                  <span className="item-badge">{item.sourceLabel}</span>
                  <div>
                    <p className="item-title">{item.answer}</p>
                    <p className="item-sub">{item.question}</p>
                  </div>
                  <span className="result-status not">{item.attempts}회</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">세션별 상세 기록</h3>
            <p className="panel-note">기존 학습 리포트의 누적 기록 화면</p>
          </div>
        </div>
        <div className="section-body">
          <SessionTable sessions={completedSessions} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

function StatusText({ status }: { status?: MasteryStatus }) {
  if (!status) return <span className="result-status">대기</span>;

  const className =
    status === "Not mastered"
      ? "result-status not"
      : status === "Perfect"
        ? "result-status perfect"
        : "result-status good";

  return <span className={className}>{status}</span>;
}

type TeacherCustomerRow = { customerNo: string; customerName: string; schoolYear: number };

// 교사 실연동: /api/teacher/customers로 담당 회원을 불러오고,
// 회원 선택 시 그 회원의 오답 현황(/api/study/wrong-answers)을 조회해 보여준다.
function TeacherMembers({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (no: string, name: string) => void;
}) {
  const [customers, setCustomers] = useState<TeacherCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberItems, setMemberItems] = useState<LearningItem[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/teacher/customers")
      .then((r) => r.json())
      .then((d: { customers?: TeacherCustomerRow[]; error?: string }) => {
        if (!mounted) return;
        setCustomers(d.customers ?? []);
        if (d.error) setError("담당 회원을 불러오지 못했어. (교사 계정으로 로그인했는지 확인)");
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setError("담당 회원을 불러오지 못했어.");
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function handleSelect(no: string, name: string) {
    onSelect(no, name);
    setMemberLoading(true);
    setMemberItems([]);
    getWrongAnswerItems(no)
      .then((items) => setMemberItems(items))
      .catch(() => setMemberItems([]))
      .finally(() => setMemberLoading(false));
  }

  const selectedName = customers.find((c) => c.customerNo === selected)?.customerName ?? selected;
  const countBy = (t: string) => memberItems.filter((i) => i.sourceType === t).length;

  return (
    <div className="dashboard-grid">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">담당 회원 {customers.length ? `(${customers.length}명)` : ""}</h3>
            <p className="panel-note">회원을 선택하면 아래에 해당 회원 기록만 표시돼</p>
          </div>
        </div>
        <div className="section-body item-list">
          {loading ? (
            <div className="empty-state">불러오는 중…</div>
          ) : error ? (
            <div className="empty-state">{error}</div>
          ) : customers.length === 0 ? (
            <div className="empty-state">담당 회원이 없어.</div>
          ) : (
            customers.map((c) => (
              <button
                key={c.customerNo}
                className={`side-button ${selected === c.customerNo ? "active" : ""}`}
                onClick={() => handleSelect(c.customerNo, c.customerName)}
              >
                {c.customerName || c.customerNo}
                <span style={{ color: "var(--ink-subtle)" }}> · {c.customerNo}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">회원 오답 현황</h3>
            <p className="panel-note">
              {selected ? `${selectedName} 님의 최근 복습 대상 오답` : "왼쪽에서 회원을 선택해줘"}
            </p>
          </div>
        </div>
        <div className="section-body">
          {!selected ? (
            <div className="empty-state">회원을 선택하면 오답 현황이 표시돼.</div>
          ) : memberLoading ? (
            <div className="empty-state">불러오는 중…</div>
          ) : memberItems.length === 0 ? (
            <div className="empty-state">최근 조회 기간에 오답이 없어.</div>
          ) : (
            <>
              <div className="metric-grid">
                <Metric label="오답" value={`${memberItems.length}`} />
                <Metric label="단어" value={`${countBy("word")}`} />
                <Metric label="문장" value={`${countBy("sentence")}`} />
                <Metric label="평가" value={`${countBy("assessment")}`} />
              </div>
              <div className="item-list" style={{ marginTop: 12 }}>
                {memberItems.map((it) => (
                  <div className="item-row" key={it.id}>
                    <span className="item-badge">{it.sourceLabel}</span>
                    <div>
                      <p className="item-title">{it.answerEn}</p>
                      <p className="item-sub">{it.meaningKo ?? it.originalQuestion ?? it.unitName}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TeacherDashboard({ sessions }: { sessions: QuizSession[] }) {
  const isExternal = getLearningSource() === "external-api";
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");

  const average =
    sessions.length > 0
      ? Math.round(sessions.reduce((sum, session) => sum + session.score, 0) / sessions.length)
      : 0;
  const completedItems = sessions.reduce((sum, session) => sum + session.completedItems, 0);

  // 실교사(external)는 선택한 회원의 세션만, 데모(mock)는 전체를 표시.
  const memberSessions = selected
    ? sessions.filter((s) => String(s.studentId) === selected || String(s.memberId) === selected)
    : [];
  const scope = isExternal ? memberSessions : sessions;
  const label = isExternal && selectedName ? `${selectedName} 님의 ` : "";
  const scopeReview = scope.flatMap((s) => s.results.filter((r) => r.status === "Not mastered"));

  return (
    <section className="teacher-view">
      {isExternal ? (
        <TeacherMembers
          selected={selected}
          onSelect={(no, name) => {
            setSelected(no);
            setSelectedName(name);
          }}
        />
      ) : null}

      <div className="panel">
        <div className="section-body">
          <div className="metric-grid">
            <Metric label="전체 세션" value={`${sessions.length}`} />
            <Metric label="평균 점수" value={`${average}점`} />
            <Metric label="완료 문항" value={`${completedItems}`} />
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">반별 성취도 추이</h3>
              <p className="panel-note">전체 세션 점수 추이</p>
            </div>
          </div>
          <div className="section-body">
            <ScoreTrendChart sessions={sessions} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">문항 결과 분포</h3>
              <p className="panel-note">전체 세션의 마스터리 상태</p>
            </div>
          </div>
          <div className="section-body">
            <StatusDonutChart sessions={sessions} />
          </div>
        </div>
      </div>

      {isExternal && !selected ? (
        <div className="panel">
          <div className="section-body">
            <div className="empty-state">
              위 목록에서 회원을 선택하면 해당 회원의 세션·학습 상세만 표시됩니다.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">{label}세션 점수</h3>
                <p className="panel-note">세션별 점수</p>
              </div>
            </div>
            <div className="section-body">
              <SessionScoreBars sessions={scope} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">{label}최근 학습 세션</h3>
                <p className="panel-note">완료한 복습 세션</p>
              </div>
            </div>
            <div className="section-body">
              {scope.length === 0 ? (
                <div className="empty-state">완료된 세션이 없습니다.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>학생</th>
                      <th>완료</th>
                      <th>점수</th>
                      <th>학습일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scope.map((session) => (
                      <tr key={session.id}>
                        <td>{session.studentName}</td>
                        <td>{session.completedItems}/{session.totalItems}</td>
                        <td>{session.score}점</td>
                        <td>{formatDate(session.completedAt ?? session.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">{label}세션별 학습 상세</h3>
                <p className="panel-note">각 세션에서 학습한 단어·문장 전체 내역</p>
              </div>
            </div>
            <div className="section-body">
              <SessionDetails sessions={scope} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">{label}재복습 필요 문항</h3>
                <p className="panel-note">Not mastered 결과만 모아 확인</p>
              </div>
            </div>
            <div className="section-body item-list">
              {scopeReview.length === 0 ? (
                <div className="empty-state">재복습 필요 문항이 없습니다.</div>
              ) : (
                scopeReview.map((item, i) => (
                  <div className="item-row" key={`${item.itemId}-${item.answer}-${i}`}>
                    <span className={`item-badge cat-${item.sourceType}`}>{item.sourceLabel}</span>
                    <div>
                      <p className="item-title">{item.answer}</p>
                      <p className="item-sub">{item.question}</p>
                    </div>
                    <span className="result-status not">{scoreStatus(item.status)}점</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// 교사용: 세션별로 학습한 단어·문장 전체 내역(문제/정답/결과/시도).
function SessionDetails({ sessions }: { sessions: QuizSession[] }) {
  const completed = sessions.filter((session) => session.results.length > 0);
  if (completed.length === 0) {
    return <div className="empty-state">표시할 세션이 없습니다.</div>;
  }
  return (
    <div className="session-details">
      {completed.map((session) => (
        <div className="session-detail-block" key={session.id}>
          <div className="session-detail-head">
            <strong>{session.studentName}</strong>
            <span>{formatDate(session.completedAt ?? session.createdAt)}</span>
            <span>
              {session.score}점 · {session.completedItems}/{session.totalItems}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>영역</th>
                <th>정답</th>
                <th>결과</th>
                <th>시도</th>
              </tr>
            </thead>
            <tbody>
              {session.results.map((r, i) => (
                <tr key={`${session.id}-${r.itemId}-${i}`}>
                  <td>{r.sourceLabel}</td>
                  <td>{r.answer}</td>
                  <td>
                    <span className={`result-status ${statusClass(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td>{r.attempts}회</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ScoreTrendChart({ sessions }: { sessions: QuizSession[] }) {
  const data = [...sessions]
    .filter((session) => session.results.length > 0)
    .sort((a, b) => new Date(a.completedAt ?? a.createdAt).getTime() - new Date(b.completedAt ?? b.createdAt).getTime())
    .slice(-8);

  if (data.length === 0) {
    return <div className="empty-state">표시할 세션 데이터가 없습니다.</div>;
  }

  const width = 640;
  const height = 220;
  const padX = 42;
  const padTop = 24;
  const padBottom = 36;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padTop - padBottom;
  const points = data.map((session, index) => {
    const x = data.length === 1 ? width / 2 : padX + (chartWidth * index) / (data.length - 1);
    const y = padTop + chartHeight - (chartHeight * session.score) / 100;
    return { x, y, session };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="chart-shell">
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="세션 점수 추이">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padTop + chartHeight - (chartHeight * tick) / 100;
          return (
            <g key={tick}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} className="chart-grid-line" />
              <text x={12} y={y + 4} className="chart-axis-text">{tick}</text>
            </g>
          );
        })}
        <polyline points={line} className="score-line" />
        {points.map((point) => (
          <g key={point.session.id}>
            <circle cx={point.x} cy={point.y} r="5" className="score-dot" />
            <text x={point.x} y={point.y - 12} className="chart-point-label">{point.session.score}</text>
          </g>
        ))}
        {points.map((point, index) => (
          <text key={`${point.session.id}-label`} x={point.x} y={height - 10} className="chart-bottom-label">
            {data.length > 4 ? index + 1 : formatShortDate(point.session.completedAt ?? point.session.createdAt)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function StatusDonutChart({ sessions }: { sessions: QuizSession[] }) {
  const counts = getStatusCounts(sessions);
  const total = STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);

  if (total === 0) {
    return <div className="empty-state">표시할 결과 데이터가 없습니다.</div>;
  }

  return (
    <div className="donut-layout">
      <div className="donut" style={{ background: buildStatusGradient(counts) }}>
        <div className="donut-center">
          <strong>{total}</strong>
          <span>문항</span>
        </div>
      </div>
      <div className="legend-list">
        {STATUS_ORDER.map((status) => (
          <div className="legend-row" key={status}>
            <span className={`legend-dot ${statusClass(status)}`} />
            <span>{statusLabel(status)}</span>
            <strong>{counts[status]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceBreakdownChart({ sessions }: { sessions: QuizSession[] }) {
  const groups = new Map<string, Record<MasteryStatus, number>>();
  sessions.forEach((session) => {
    session.results.forEach((result) => {
      const current = groups.get(result.sourceLabel) ?? emptyStatusCounts();
      current[result.status] += 1;
      groups.set(result.sourceLabel, current);
    });
  });
  const rows = Array.from(groups.entries());

  if (rows.length === 0) {
    return <div className="empty-state">표시할 영역별 데이터가 없습니다.</div>;
  }

  return (
    <div className="source-breakdown">
      {rows.map(([label, counts]) => {
        const total = STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);
        return (
          <div className="source-row" key={label}>
            <div className="source-row-head">
              <span>{label}</span>
              <strong>{total}문항</strong>
            </div>
            <div className="stacked-bar" aria-label={`${label} 성취도 분포`}>
              {STATUS_ORDER.map((status) => (
                <span
                  key={status}
                  className={`bar-segment ${statusClass(status)}`}
                  style={{ width: `${total > 0 ? (counts[status] / total) * 100 : 0}%` }}
                  title={`${status}: ${counts[status]}`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SessionScoreBars({ sessions }: { sessions: QuizSession[] }) {
  const data = sessions.filter((session) => session.results.length > 0).slice(0, 6);

  if (data.length === 0) {
    return <div className="empty-state">표시할 세션 데이터가 없습니다.</div>;
  }

  return (
    <div className="session-bars">
      {data.map((session) => (
        <div className="session-bar-row" key={session.id}>
          <div>
            <strong>{session.studentName}</strong>
            <span>{formatShortDate(session.completedAt ?? session.createdAt)}</span>
          </div>
          <div className="session-bar-track">
            <span style={{ width: `${session.score}%` }} />
          </div>
          <b>{session.score}점</b>
        </div>
      ))}
    </div>
  );
}

function SessionTable({ sessions }: { sessions: QuizSession[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <div className="empty-state">아직 완료된 세션이 없습니다.</div>;
  }

  return (
    <div>
      {sessions.map((session) => {
        const counts = getStatusCounts([session]);
        const isOpen = expanded === session.id;
        return (
          <div className="rep-session" key={session.id}>
            <div className="rep-session-head">
              <span className="rep-session-date">
                {formatDate(session.completedAt ?? session.createdAt)} · {session.completedItems}/
                {session.totalItems}문항
              </span>
              <span className="rep-session-score">{session.score}점</span>
            </div>
            <div className="rep-chips">
              <span className="rep-chip perfect">Perfect {counts.Perfect}</span>
              <span className="rep-chip good">Good {counts.Good}</span>
              <span className="rep-chip not">재복습 {counts["Not mastered"]}</span>
            </div>
            <button className="rep-more" onClick={() => setExpanded(isOpen ? null : session.id)}>
              {isOpen ? "닫기" : "상세 내역 보기"}
            </button>
            {isOpen ? (
              <div className="rep-detail">
                {session.results.length === 0 ? (
                  <div className="empty-state">학습 내역이 없습니다.</div>
                ) : (
                  session.results.map((r, i) => (
                    <div className="rep-item" key={`${session.id}-${r.itemId}-${i}`}>
                      <span className={`item-badge cat-${r.sourceType}`}>{r.sourceLabel}</span>
                      <div>
                        <div className="rep-item-main">
                          {r.answer}
                          {r.question ? ` : ${r.question}` : ""}
                        </div>
                        <div className="rep-item-sub">{r.attempts}회 시도</div>
                      </div>
                      <span className={`result-status ${statusClass(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function emptyStatusCounts(): Record<MasteryStatus, number> {
  return {
    Perfect: 0,
    Good: 0,
    "Not mastered": 0,
  };
}

function getStatusCounts(sessions: QuizSession[]) {
  const counts = emptyStatusCounts();
  sessions.forEach((session) => {
    session.results.forEach((result) => {
      counts[result.status] += 1;
    });
  });
  return counts;
}

function buildStatusGradient(counts: Record<MasteryStatus, number>) {
  const total = STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);
  let cursor = 0;
  const colors: Record<MasteryStatus, string> = {
    Perfect: "#059669",
    Good: "#2563eb",
    "Not mastered": "#dc2626",
  };
  const segments = STATUS_ORDER.map((status) => {
    const start = cursor;
    const end = cursor + (counts[status] / total) * 100;
    cursor = end;
    return `${colors[status]} ${start}% ${end}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function statusClass(status: MasteryStatus) {
  if (status === "Perfect") return "perfect";
  if (status === "Good") return "good";
  return "not";
}

function statusLabel(status: MasteryStatus) {
  return status === "Not mastered" ? "재복습" : status;
}

// 세션 내 즉각 보상 문구(초등 톤 — 실패 단어 금지).
function rewardLabel(status: MasteryStatus): string {
  if (status === "Perfect") return "Perfect!";
  if (status === "Good") return "좋아!";
  return "다시 도전!";
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
