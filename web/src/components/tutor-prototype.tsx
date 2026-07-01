"use client";

import { useEffect, useState } from "react";

import { demoSessions, demoStudent } from "@/lib/mock-data";
import { getLearningSource, getWrongAnswerItems } from "@/lib/learning/provider";
import { calculateSessionScore, scoreStatus } from "@/lib/quiz-engine";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  loadAllSessions,
  loadQuizSessions,
  readLocalSessions,
  saveQuizSession,
} from "@/lib/firebase/firestore";
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

type ActiveView = "coach" | "report" | "teacher";
type PersistenceMode = "idle" | "local" | "firestore" | "loading" | "error";

type TutorPrototypeProps = {
  appUser: AppUser;
  onLogout: () => void;
};

export function TutorPrototype({ appUser, onLogout }: TutorPrototypeProps) {
  const isTeacher = appUser.role === "teacher";
  const studentId = appUser.studentId ?? demoStudent.id;

  const [activeView, setActiveView] = useState<ActiveView>(isTeacher ? "teacher" : "coach");
  const [learningItems, setLearningItems] = useState<LearningItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [coachComment, setCoachComment] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [saveMode, setSaveMode] = useState<PersistenceMode>("idle");
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>(
    isFirebaseConfigured() ? "loading" : "local",
  );
  const [storedSessions, setStoredSessions] = useState<QuizSession[]>(() => readLocalSessions());
  // AI 튜터 대화 히스토리(서버 전달용). 화면 messages와 별개로 role/content만 보관.
  const [apiMessages, setApiMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [tutorStarting, setTutorStarting] = useState(false);

  useEffect(() => {
    if (isTeacher) return;

    let isMounted = true;

    void getWrongAnswerItems(studentId)
      .then(async (items) => {
        if (!isMounted) return;
        setLearningItems(items);
        setItemsLoaded(true);
        // POC와 동일: AI가 인사 + 1번 문제를 한국어 뜻과 함께 먼저 제시.
        await startTutor(items);
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

  const sessions = [...storedSessions, ...demoSessions].slice(0, 8);
  const currentPreviewSession: QuizSession | null =
    results.length > 0
      ? {
          id: "current-session-preview",
          uid: appUser.uid,
          studentId,
          memberId: appUser.memberId,
          studentName: appUser.displayName,
          source: getLearningSource(),
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

  type TutorTurn = { reply: string; raw?: string; status?: MasteryStatus; done?: boolean };

  // POC와 동일한 AI 주도 흐름: AI가 출제·힌트·채점·진행을 대화로 수행한다.
  async function callTutor(
    items: LearningItem[],
    msgs: { role: "user" | "assistant"; content: string }[],
  ): Promise<TutorTurn> {
    const res = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentName: appUser.displayName, items, messages: msgs }),
    });
    return (await res.json()) as TutorTurn;
  }

  // 세션 시작: AI 인사 + 1번 문제(한국어 뜻 포함)를 받아 첫 메시지로 표시.
  async function startTutor(items: LearningItem[]) {
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

  async function submitAnswer() {
    const trimmed = answer.trim();
    if (!trimmed || isSending || isFinished || tutorStarting || learningItems.length === 0) return;

    setMessages((prev) => [
      ...prev,
      { id: makeId("student"), role: "student", content: trimmed, createdAt: nowIso() },
    ]);
    setAnswer("");
    setIsSending(true);

    const nextApi = [...apiMessages, { role: "user" as const, content: trimmed }];
    try {
      const data = await callTutor(learningItems, nextApi);
      const raw = data.raw || data.reply;
      setApiMessages([...nextApi, { role: "assistant", content: raw }]);
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("assistant"),
          role: "assistant",
          content: data.reply,
          status: data.status,
          createdAt: nowIso(),
        },
      ]);
      handleTurn(data, trimmed);
    } finally {
      setIsSending(false);
    }
  }

  // AI 태그로 현재 문항 결과 확정 + 다음 문항으로 진행(다음 문제 제시는 AI가 함).
  function handleTurn(data: TutorTurn, submittedAnswer: string) {
    const item = learningItems[currentIndex];
    const attemptNumber = attemptCount + 1;

    const nextAttempts: Attempt[] = [
      ...attempts,
      {
        id: makeId("attempt"),
        itemId: item?.id ?? "",
        answer: submittedAnswer,
        feedback: data.reply,
        status: data.status,
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
      const nextIndex = currentIndex + 1;
      setResults(nextResults);
      setCurrentIndex(nextIndex);
      setAttemptCount(0);
      if (data.done || nextIndex >= learningItems.length) {
        void finishSession(padResults(nextResults), nextAttempts);
      }
      return;
    }

    // 결과 태그 없음(힌트/재시도 중) → 같은 문항 유지, 시도 횟수만 증가.
    setAttemptCount(attemptNumber);
    if (data.done) {
      void finishSession(padResults(results), nextAttempts);
    }
  }

  async function finishSession(nextResults: SessionResult[], nextAttempts: Attempt[]) {
    const completedAt = nowIso();

    // POC generate_final_report 대응: 종료 시 AI 코치 총평을 받아 화면 표시 + 세션에 저장.
    setReportLoading(true);
    let comment = "";
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: appUser.displayName, results: nextResults }),
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
      id: makeId("session"),
      uid: appUser.uid,
      studentId,
      memberId: appUser.memberId,
      studentName: appUser.displayName,
      source: getLearningSource(),
      totalItems: learningItems.length,
      completedItems: nextResults.length,
      score: calculateSessionScore(nextResults),
      results: nextResults,
      coachComment: comment || undefined,
      createdAt: messages[0]?.createdAt ?? completedAt,
      completedAt,
    };

    const saved = await saveQuizSession(session, nextAttempts);
    setSaveMode(saved.mode);
    setPersistenceMode(saved.mode);
    const refreshed = await loadQuizSessions(studentId);
    setStoredSessions(refreshed.sessions);
    setPersistenceMode(refreshed.mode);
    setIsFinished(true);
  }

  function restartSession() {
    setAnswer("");
    setCurrentIndex(0);
    setAttemptCount(0);
    setAttempts([]);
    setResults([]);
    setApiMessages([]);
    setMessages([]);
    setIsFinished(false);
    setCoachComment("");
    setReportLoading(false);
    setSaveMode("idle");
    // POC처럼 AI 인사 + 1번 문제부터 다시 시작.
    void startTutor(learningItems);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">Y</div>
          <h1 className="brand-title">윤선생 AI 코치</h1>
          <p className="brand-subtitle">Firebase pilot workspace</p>
        </div>

        <div className="side-section">
          <div className="side-label">현재 사용자</div>
          <div className="connection">
            <span>
              {appUser.displayName}
              {appUser.memberId ? ` · ${appUser.memberId}` : ""}
            </span>
            <span>{isTeacher ? "교사" : demoStudent.level}</span>
          </div>
        </div>

        <div className="side-section">
          <div className="side-label">보기</div>
          <div className="role-switch">
            {isTeacher ? (
              <button
                className={`side-button ${activeView === "teacher" ? "active" : ""}`}
                onClick={() => setActiveView("teacher")}
              >
                교사용 대시보드
              </button>
            ) : (
              <>
                <button
                  className={`side-button ${activeView === "coach" ? "active" : ""}`}
                  onClick={() => setActiveView("coach")}
                >
                  학생 코칭룸
                </button>
                <button
                  className={`side-button ${activeView === "report" ? "active" : ""}`}
                  onClick={() => setActiveView("report")}
                >
                  내 학습 리포트
                </button>
              </>
            )}
          </div>
        </div>

        <div className="side-section">
          <div className="side-label">Firebase</div>
          <div className="connection">
            <span>{persistenceLabel(persistenceMode)}</span>
            <span className={`status-dot ${persistenceMode === "firestore" ? "live" : ""}`} />
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
            <div className="eyebrow">AI REVIEW PILOT</div>
            <h2 className="page-title">
              {activeView === "coach"
                ? "오늘의 오답 복습"
                : activeView === "report"
                  ? "나의 학습 리포트"
                  : "학습 운영 대시보드"}
            </h2>
            <p className="page-copy">
              {activeView === "coach"
                ? "학습 API에서 받은 오답 항목을 표준 문항으로 바꾸고, 세션 결과를 Firestore에 남기는 구조입니다."
                : activeView === "report"
                  ? "세션별 점수 변화, 성취도 분포, 영역별 약점을 누적해서 확인합니다."
                  : "학생별 세션, 점수, 미숙 문항을 한 화면에서 확인합니다."}
            </p>
          </div>
          {activeView === "coach" ? (
            <div className="toolbar">
              <button className="button" onClick={restartSession}>
                세션 초기화
              </button>
              <button className="button primary" disabled={!isFinished}>
                {saveLabel(saveMode)}
              </button>
            </div>
          ) : null}
        </header>

        {activeView === "coach" ? (
          <section className="workspace">
            <div className="panel quiz-area">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">AI 코칭 대화</h3>
                  <p className="panel-note">정답/힌트/재시도 상태를 서버 route에서 판정합니다.</p>
                </div>
                <div className="progress-wrap">
                  <div className="progress-meta">
                    <span>{results.length}/{learningItems.length} 완료</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>

              {isFinished ? (
                <SessionComplete
                  score={score}
                  perfectCount={perfectCount}
                  goodCount={goodCount}
                  needsReviewCount={needsReviewCount}
                  results={results}
                  coachComment={coachComment}
                  reportLoading={reportLoading}
                  onRestart={restartSession}
                  onViewReport={() => setActiveView("report")}
                />
              ) : itemsLoaded && learningItems.length === 0 ? (
                <div className="empty-celebration">
                  <div className="completion-badge">🎉</div>
                  <h3 className="panel-title">오늘 복습할 오답이 없어!</h3>
                  <p className="panel-note">
                    지난 학습을 완벽하게 해냈다는 뜻이야. 다음 학습도 기대할게!
                  </p>
                </div>
              ) : (
                <>
                  <div className="chat-feed">
                    {messages.map((message) => (
                      <div key={message.id} className={`message ${message.role}`}>
                        {message.content}
                        {message.status ? (
                          <span className="message-status">{message.status}</span>
                        ) : null}
                      </div>
                    ))}
                    {isSending ? (
                      <div className="message assistant typing">AI 코치가 생각 중…</div>
                    ) : null}
                  </div>

                  <div className="composer">
                    <input
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") submitAnswer();
                      }}
                      placeholder="영어 답안을 입력하거나, 모르면 '힌트'라고 적어봐"
                      disabled={isSending}
                    />
                    <button
                      className="button primary"
                      onClick={submitAnswer}
                      disabled={isSending}
                    >
                      제출
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        ) : activeView === "report" ? (
          <StudentReport sessions={reportSessions} />
        ) : (
          <TeacherDashboard sessions={reportSessions} />
        )}
      </main>
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
  onRestart: () => void;
  onViewReport: () => void;
}) {
  return (
    <div className="completion">
      <div className="completion-head">
        <div className="completion-badge">🏆</div>
        <h3 className="panel-title">학습 완료!</h3>
        <p className="panel-note">오늘의 복습 결과를 확인해봐</p>
      </div>

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
                <td>{result.question}</td>
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

function TeacherDashboard({ sessions }: { sessions: QuizSession[] }) {
  const average =
    sessions.length > 0
      ? Math.round(sessions.reduce((sum, session) => sum + session.score, 0) / sessions.length)
      : 0;
  const reviewItems = sessions.flatMap((session) =>
    session.results.filter((result) => result.status === "Not mastered"),
  );
  const completedItems = sessions.reduce((sum, session) => sum + session.completedItems, 0);

  return (
    <section className="teacher-view">
      <div className="panel">
        <div className="section-body">
          <div className="metric-grid">
            <Metric label="세션" value={`${sessions.length}`} />
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
              <p className="panel-note">최근 세션 점수 기준</p>
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

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">최근 세션 점수</h3>
            <p className="panel-note">운영자가 빠르게 스캔하는 세션별 막대 차트</p>
          </div>
        </div>
        <div className="section-body">
          <SessionScoreBars sessions={sessions} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">최근 학습 세션</h3>
            <p className="panel-note">Firestore quizSessions 컬렉션 표시 예시</p>
          </div>
        </div>
        <div className="section-body">
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
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.studentName}</td>
                  <td>{session.completedItems}/{session.totalItems}</td>
                  <td>{session.score}점</td>
                  <td>{formatDate(session.completedAt ?? session.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">세션별 학습 상세</h3>
            <p className="panel-note">각 세션에서 학습한 단어·문장 전체 내역</p>
          </div>
        </div>
        <div className="section-body">
          <SessionDetails sessions={sessions} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">재복습 필요 문항</h3>
            <p className="panel-note">Not mastered 결과만 모아 교사가 확인</p>
          </div>
        </div>
        <div className="section-body item-list">
          {reviewItems.length === 0 ? (
            <div className="empty-state">재복습 필요 문항이 없습니다.</div>
          ) : (
            reviewItems.map((item) => (
              <div className="item-row" key={`${item.itemId}-${item.answer}`}>
                <span className="item-badge">{item.sourceLabel}</span>
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
                <th>문제(뜻)</th>
                <th>정답</th>
                <th>결과</th>
                <th>시도</th>
              </tr>
            </thead>
            <tbody>
              {session.results.map((r, i) => (
                <tr key={`${session.id}-${r.itemId}-${i}`}>
                  <td>{r.sourceLabel}</td>
                  <td>{r.question}</td>
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
  if (sessions.length === 0) {
    return <div className="empty-state">아직 완료된 세션이 없습니다.</div>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>학습일</th>
          <th>문항</th>
          <th>점수</th>
          <th>Perfect</th>
          <th>Good</th>
          <th>재복습</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => {
          const counts = getStatusCounts([session]);
          return (
            <tr key={session.id}>
              <td>{formatDate(session.completedAt ?? session.createdAt)}</td>
              <td>{session.completedItems}/{session.totalItems}</td>
              <td>{session.score}점</td>
              <td>{counts.Perfect}</td>
              <td>{counts.Good}</td>
              <td>{counts["Not mastered"]}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
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

function persistenceLabel(mode: PersistenceMode) {
  if (mode === "firestore") return "Firestore 연결";
  if (mode === "loading") return "연결 확인 중";
  if (mode === "error") return "연결 오류";
  return "Mock 저장소";
}

function saveLabel(mode: PersistenceMode) {
  if (mode === "firestore") return "Firestore 저장됨";
  if (mode === "local") return "Local 저장됨";
  if (mode === "error") return "저장 오류";
  if (mode === "loading") return "저장 중";
  return "저장 대기";
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
