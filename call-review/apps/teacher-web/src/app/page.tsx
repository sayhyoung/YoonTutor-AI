"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { percent } from "./analytics";
import { DailyBars, Donut, Kpi } from "./charts";
import { DailyBarsLegend, OUTCOME_SEGMENTS } from "./report-parts";
import { OperationsSettings } from "./settings";
import { BM_LABELS, StudentReport, formatDateTime } from "./student-report";
import type { ClassStats, TeacherCallStatus, TeacherStudentRow, TeacherStudentsResponse } from "./types";

type Filter = "전체" | TeacherCallStatus;
type View = "overview" | "settings";
type AuthState = "checking" | "signed-out" | "signed-in";

function isWithinDays(iso: string, days: number) {
  return Date.now() - new Date(iso).getTime() <= days * 24 * 60 * 60 * 1000;
}

async function getJson<T>(url: string): Promise<{ status: number; data: T | null; error?: string }> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    return { status: response.status, data: response.ok ? data : null, error: data?.error };
  } catch {
    return { status: 0, data: null, error: "서버에 연결하지 못했어요." };
  }
}

function requestOverview() {
  return getJson<TeacherStudentsResponse>("/api/call-review/teacher/students");
}

export default function TeacherDashboard() {
  const [auth, setAuth] = useState<AuthState>("checking");
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<TeacherStudentsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("전체");
  const [selected, setSelected] = useState<TeacherStudentRow | null>(null);
  const [view, setView] = useState<View>("overview");

  const applyOverview = useCallback((result: Awaited<ReturnType<typeof requestOverview>>) => {
    if (result.status === 401 || result.status === 403) {
      setNotice(result.status === 403 ? (result.error ?? "교사 계정으로 로그인해 주세요.") : null);
      setOverview(null);
      setAuth("signed-out");
      return;
    }
    if (!result.data) {
      setLoadError(result.error ?? "담당 학생 목록을 불러오지 못했어요.");
      setAuth("signed-in");
      return;
    }
    setLoadError(null);
    setOverview(result.data);
    setAuth("signed-in");
  }, []);

  const loadOverview = useCallback(async () => {
    applyOverview(await requestOverview());
  }, [applyOverview]);

  useEffect(() => {
    let cancelled = false;
    void requestOverview().then((result) => {
      if (!cancelled) applyOverview(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyOverview]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setOverview(null);
    setSelected(null);
    setNotice(null);
    setAuth("signed-out");
  }

  if (auth === "checking") {
    return (
      <main className="auth-shell" aria-busy="true">
        <p className="auth-loading">교사 정보를 확인하고 있어요…</p>
      </main>
    );
  }

  if (auth === "signed-out") {
    return <LoginScreen notice={notice} onSignedIn={loadOverview} />;
  }

  const students = overview?.students ?? [];
  const teacherName = overview?.teacher.displayName;
  return (
    <main className="dashboard-shell">
      <aside className="sidebar" aria-label="교사 관리 메뉴">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">윤</span>
          <div>
            <strong>AI 전화관리</strong>
            <span>{teacherName ? `${teacherName} 선생님` : "교사용"}</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {(
            [
              ["overview", "관리 현황"],
              ["settings", "수업 설정"],
            ] as const
          ).map(([key, label]) => (
            <button
              aria-current={view === key ? "page" : undefined}
              className={`nav-link${view === key ? " active" : ""}`}
              key={key}
              onClick={() => {
                setView(key);
                setSelected(null);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="sidebar-logout" onClick={() => void logout()} type="button">로그아웃</button>
      </aside>

      <section className="dashboard-main" id="calls">
        {view === "settings" ? (
          <OperationsSettings onChanged={() => void loadOverview()} students={students} />
        ) : selected ? (
          <StudentReport key={selected.customerNo} onBack={() => setSelected(null)} student={selected} />
        ) : (
          <>
            {loadError ? <p className="inline-alert" role="alert">{loadError}</p> : null}
            {overview && !overview.reportsConfigured ? (
              <p className="inline-alert" role="status">통화 결과 저장소가 연결되지 않아 학생 목록만 표시해요.</p>
            ) : null}
            {overview?.reportsError ? (
              <p className="inline-alert" role="alert">통화 결과를 불러오지 못했어요. 잠시 후 새로 고침해 주세요.</p>
            ) : null}

            <OverviewHero onRefresh={() => void loadOverview()} students={students} teacherName={teacherName ?? null} />
            {overview ? <ClassOverview stats={overview.classStats} /> : null}
            <StudentTable filter={filter} onFilter={setFilter} onSelect={setSelected} students={students} />
          </>
        )}
      </section>
    </main>
  );
}

function OverviewHero({
  students,
  teacherName,
  onRefresh,
}: {
  students: TeacherStudentRow[];
  teacherName: string | null;
  onRefresh: () => void;
}) {
  const recent = students.filter((student) => student.lastCall && isWithinDays(student.lastCall.endedAt, 7)).length;
  const retry = students.filter((student) => student.status === "재통화 필요").length;
  const missed = students.filter((student) => student.status === "부재중").length;
  const none = students.filter((student) => student.status === "기록 없음").length;
  const participation = percent(students.length - none, students.length);

  return (
    <header className="overview-hero">
      <div className="overview-hero-top">
        <div>
          <p className="report-hero-eyebrow">윤선생 교사 LMS · AI 관리 전화</p>
          <h1>{teacherName ? `${teacherName} 선생님의 관리 현황` : "AI 관리 전화 현황"}</h1>
          <p className="overview-hero-copy">누가 통화를 마쳤고, 어떤 표현을 다음에 다시 확인해야 하는지 한눈에 봅니다.</p>
        </div>
        <button className="hero-button" onClick={onRefresh} type="button">새로 고침</button>
      </div>
      <div className="kpi-grid on-hero">
        <Kpi label="담당 학습자" value={students.length} unit="명" detail="study-api 담당 회원" />
        <Kpi label="통화 참여율" value={participation ?? "—"} unit={participation !== null ? "%" : undefined} detail={`한 번 이상 통화 ${students.length - none}명`} tone="good" />
        <Kpi label="최근 7일 통화" value={recent} unit="명" detail="마지막 통화 기준" tone="accent" />
        <Kpi label="관리 필요" value={retry + missed} unit="명" detail={`부재중 ${missed} · 응답 없이 종료 ${retry}`} tone={retry + missed > 0 ? "warn" : "default"} />
      </div>
    </header>
  );
}

function ClassOverview({ stats }: { stats: ClassStats }) {
  const judged = stats.outcomeTotals.correct + stats.outcomeTotals.hinted + stats.outcomeTotals.retry;
  const accuracy = percent(stats.outcomeTotals.correct, judged);
  return (
    <div className="report-grid overview-grid">
      <section className="report-panel wide">
        <div className="report-panel-head">
          <h2>최근 {stats.days}일 관리 전화</h2>
          <p>날짜별 통화 수 · 종료 유형별</p>
        </div>
        <DailyBars days={stats.dailyCalls} />
        <DailyBarsLegend />
      </section>
      <section className="report-panel">
        <div className="report-panel-head">
          <h2>반 전체 복습 결과</h2>
          <p>담당 학습자 통화의 표현별 첫 판정</p>
        </div>
        <Donut
          ariaLabel="반 전체 복습 결과"
          centerLabel="정답률"
          centerValue={accuracy !== null ? `${accuracy}%` : "—"}
          segments={OUTCOME_SEGMENTS(stats.outcomeTotals)}
        />
      </section>
      <section className="report-panel">
        <div className="report-panel-head">
          <h2>많이 헷갈린 표현 TOP 5</h2>
          <p>여러 학습자가 다시 본 표현 순</p>
        </div>
        {stats.topMissed.length === 0 ? (
          <p className="chart-empty">아직 다시 본 표현이 없어요.</p>
        ) : (
          <ol className="missed-list ranked">
            {stats.topMissed.map((row, index) => (
              <li key={row.answerEn}>
                <span className="rank" aria-hidden="true">{index + 1}</span>
                <div>
                  <span className="missed-en" lang="en">{row.answerEn}</span>
                  <span className="missed-ko">{row.promptKo}</span>
                </div>
                <span className="miss-count">{row.students}명 · {row.misses}회</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function LoginScreen({ notice, onSignedIn }: { notice: string | null; onSignedIn: () => Promise<void> }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!userId.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim(), password, role: "teacher" }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? "아이디 또는 비밀번호를 다시 확인해 주세요." : "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setPassword("");
      await onSignedIn();
    } catch {
      setError("서버에 연결하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <div className="brand auth-brand">
          <span className="brand-mark" aria-hidden="true">윤</span>
          <div>
            <strong>AI 전화관리</strong>
            <span>교사용</span>
          </div>
        </div>
        <h1>교사 계정으로 로그인</h1>
        <p className="page-description">윤선생 교사 아이디로 로그인하면 담당 학습자의 관리 전화 결과를 볼 수 있어요.</p>
        {notice ? <p className="inline-alert" role="alert">{notice}</p> : null}
        <label className="field-group">
          <span>아이디</span>
          <input autoComplete="username" onChange={(event) => setUserId(event.target.value)} value={userId} />
        </label>
        <label className="field-group">
          <span>비밀번호</span>
          <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" disabled={!userId.trim() || !password || submitting} type="submit">
          {submitting ? "로그인하는 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}

function StudentTable({
  students,
  filter,
  onFilter,
  onSelect,
}: {
  students: TeacherStudentRow[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
  onSelect: (student: TeacherStudentRow) => void;
}) {
  const rows = useMemo(
    () => (filter === "전체" ? students : students.filter((student) => student.status === filter)),
    [filter, students],
  );

  return (
    <section className="call-list student-table" aria-label="담당 학습자 목록">
      <div className="section-heading">
        <div>
          <h2>담당 학습자</h2>
          <p>‘리포트’를 누르면 학습자별 학습현황 리포트를 볼 수 있어요.</p>
        </div>
        <div className="filter-row" role="group" aria-label="상태 필터">
          {(["전체", "완료", "부재중", "재통화 필요", "기록 없음"] as Filter[]).map((item) => (
            <button
              aria-pressed={filter === item}
              className={`filter-button${filter === item ? " active" : ""}`}
              key={item}
              onClick={() => onFilter(item)}
              type="button"
            >
              {item}
              <span className="filter-count">
                {item === "전체" ? students.length : students.filter((student) => student.status === item).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="table-empty">{students.length === 0 ? "담당 학습자가 없어요." : "이 상태의 학습자가 없어요."}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>학습자</th>
                <th>상태</th>
                <th>다음 통화</th>
                <th>마지막 통화</th>
                <th>최근 정답률</th>
                <th>통화 수</th>
                <th><span className="sr-only">리포트</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => {
                const judged = student.lastCall
                  ? student.lastCall.targets.filter((target) => target.outcome !== "skipped").length
                  : 0;
                const correct = student.lastCall
                  ? student.lastCall.targets.filter((target) => target.outcome === "correct").length
                  : 0;
                const accuracy = percent(correct, judged);
                return (
                  <tr key={student.customerNo}>
                    <td data-label="학습자">
                      <span className="student-cell">
                        <span className="avatar-chip" aria-hidden="true">{student.customerName.slice(0, 1)}</span>
                        <span>
                          <button className="name-link" onClick={() => onSelect(student)} type="button">
                            {student.customerName}
                          </button>
                          <span className="cell-meta">
                            {[student.schoolYear ? `${student.schoolYear}학년` : null, ...student.bmNames.map((bm) => BM_LABELS[bm] ?? bm)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td data-label="상태"><StatusBadge status={student.status} /></td>
                    <td data-label="다음 통화">
                      {student.schedule?.nextCallLabel ?? <span className="cell-meta">{student.schedule ? "쉬는 중" : "일정 없음"}</span>}
                    </td>
                    <td data-label="마지막 통화">{student.lastCall ? formatDateTime(student.lastCall.endedAt) : "—"}</td>
                    <td data-label="최근 정답률">
                      {accuracy !== null ? (
                        <span className="mini-meter">
                          <span className="mini-meter-track" aria-hidden="true"><span style={{ width: `${accuracy}%` }} /></span>
                          <strong>{accuracy}%</strong>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="통화 수">{student.callCount}회</td>
                    <td>
                      <button
                        aria-label={`${student.customerName} 학습현황 리포트 보기`}
                        className="report-button"
                        onClick={() => onSelect(student)}
                        type="button"
                      >
                        리포트
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: TeacherCallStatus }) {
  const statusClass =
    status === "완료" ? "complete" : status === "재통화 필요" ? "retry" : status === "부재중" ? "missed" : "none";
  return <span className={`status-badge ${statusClass}`}>{status}</span>;
}
