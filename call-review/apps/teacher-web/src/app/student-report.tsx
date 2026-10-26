"use client";

import { useEffect, useMemo, useState } from "react";

import { kstToIso, selectCallItems } from "@yoon-call/shared";

import { analyzeReports, coachSummary } from "./analytics";
import { formatDateTime } from "./format";
import { MessageComposer } from "./message-composer";
import { DailyBarsLegend, OUTCOME_SEGMENTS } from "./report-parts";
import { Donut, Kpi, StackedBars, TrendLine } from "./charts";
import type { CallOutcome, FinishReason, StudentReportResponse, TeacherStudentRow } from "./types";

export const FINISH_LABELS: Record<FinishReason, string> = {
  completed: "정상 완료",
  stopped: "직접 종료",
  "no-response": "응답 없음",
};

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  correct: "완료함",
  hinted: "힌트로 완료",
  retry: "복습 필요",
  skipped: "못 했어요",
};

export const BM_LABELS: Record<string, string> = {
  HOME: "교실",
  WELL: "웰스터디",
  FOREST: "숲",
  IGSE: "IGSE",
};

export { formatDateTime };

function formatDate(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

export function StudentReport({ student, onBack }: { student: TeacherStudentRow; onBack: () => void }) {
  const [data, setData] = useState<StudentReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/call-review/teacher/students/${encodeURIComponent(student.customerNo)}/reports`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (StudentReportResponse & { error?: string }) | null;
        if (cancelled) return;
        if (response.ok && body) setData(body);
        else setError(body?.error ?? "리포트를 불러오지 못했어요.");
      })
      .catch(() => {
        if (!cancelled) setError("서버에 연결하지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [student.customerNo]);

  const analytics = useMemo(() => analyzeReports(data?.reports ?? []), [data]);
  const reports = useMemo(
    () => [...(data?.reports ?? [])].sort((a, b) => b.endedAt.localeCompare(a.endedAt)),
    [data],
  );
  // 다음 통화 예정 표현: 학생 앱과 같은 출제 규칙(새 차시 오답 → 복습 필요 → 돌아가며 다시 보기, 최대 10개).
  const planned = useMemo(() => {
    if (!data?.upcoming) return null;
    const candidates = data.upcoming.items.flatMap((item) =>
      item.sourceType === "word" || item.sourceType === "sentence"
        ? [
            {
              id: item.id,
              studentId: student.customerNo,
              sourceType: item.sourceType,
              sourceLabel: item.sourceType === "word" ? "단어 복습" : "문장 복습",
              promptKo: item.meaningKo ?? item.unitName,
              answerEn: item.answerEn,
              lessonLabel: item.unitName,
              ...(kstToIso(item.wrongAt) ? { studiedAt: kstToIso(item.wrongAt) } : {}),
            },
          ]
        : [],
    );
    const practiced = (data.reports ?? []).flatMap((report) =>
      report.targets.map((target) => ({ answerEn: target.answerEn, outcome: target.outcome, practicedAt: report.endedAt })),
    );
    return selectCallItems(candidates, practiced);
  }, [data, student.customerNo]);
  const plannedNote =
    planned?.mode === "new"
      ? "새로 학습한 차시의 오답"
      : planned?.mode === "review"
        ? "새 학습이 없어 복습이 필요한 표현"
        : planned?.mode === "rotation"
          ? "모두 맞혀서 돌아가며 다시 보는 표현"
          : "";
  const meta = [
    student.schoolYear ? `${student.schoolYear}학년` : null,
    ...student.bmNames.map((bm) => BM_LABELS[bm] ?? bm),
    student.usingPerfectCare ? "퍼펙트케어" : null,
  ].filter(Boolean);

  return (
    <section className="report-page" aria-labelledby="report-title">
      <button className="back-link" onClick={onBack} type="button">← 담당 학습자 목록</button>

      <header className="report-hero">
        <div className="report-hero-copy">
          <p className="report-hero-eyebrow">회원 학습현황 리포트 · AI 관리 전화</p>
          <h1 id="report-title">{student.customerName}</h1>
          <p className="report-hero-meta">
            {meta.join(" · ")}
            {analytics.firstAt && analytics.lastAt
              ? ` · ${formatDate(analytics.firstAt)} ~ ${formatDate(analytics.lastAt)}`
              : ""}
          </p>
        </div>
        <div className="report-hero-score" aria-label="복습 정답률">
          <span>복습 정답률</span>
          <strong>{analytics.accuracy !== null ? `${analytics.accuracy}%` : "—"}</strong>
          <small>{analytics.reviewed > 0 ? `판정 표현 ${analytics.reviewed}개 기준` : "판정 기록 없음"}</small>
        </div>
      </header>

      {error ? <p className="inline-alert" role="alert">{error}</p> : null}
      {!error && !data ? <p className="detail-loading" aria-busy="true">리포트를 만드는 중…</p> : null}

      {data ? (
        <>
          <div className="kpi-grid">
            <Kpi label="관리 전화" value={analytics.calls} unit="회" detail={analytics.lastAt ? `마지막 ${formatDateTime(analytics.lastAt)}` : "아직 없음"} tone="accent" />
            <Kpi label="정상 완료율" value={analytics.completionRate ?? "—"} unit={analytics.completionRate !== null ? "%" : undefined} detail={`완료 ${analytics.finishTotals.completed} · 직접 종료 ${analytics.finishTotals.stopped}`} tone="good" />
            <Kpi label="다시 볼 표현" value={analytics.missed.length} unit="개" detail="한 번이라도 틀린 표현" tone={analytics.missed.length > 0 ? "warn" : "default"} />
            <Kpi label="대화 응답" value={analytics.avgTurns ?? "—"} unit={analytics.avgTurns !== null ? "번" : undefined} detail="통화당 평균 영어 답변" />
          </div>

          <section className="coach-card" aria-label="AI 코치 총평">
            <span className="coach-card-mark" aria-hidden="true">✦</span>
            <div>
              <strong>관리 전화 총평</strong>
              <p>{coachSummary(student.customerName, analytics)}</p>
            </div>
          </section>

          <div className="report-grid">
            <section className="report-panel wide">
              <div className="report-panel-head">
                <h2>통화별 복습 정답률</h2>
                <p>판정한 표현 중 바로 맞힌 비율 · 오래된 통화 → 최근 통화</p>
              </div>
              <TrendLine points={analytics.trend} />
            </section>

            <section className="report-panel">
              <div className="report-panel-head">
                <h2>복습 결과 분포</h2>
                <p>전체 통화의 표현별 첫 판정</p>
              </div>
              <Donut
                ariaLabel="복습 결과 분포"
                centerLabel="표현"
                centerValue={String(analytics.outcomeTotals.correct + analytics.outcomeTotals.hinted + analytics.outcomeTotals.retry + analytics.outcomeTotals.skipped)}
                segments={OUTCOME_SEGMENTS(analytics.outcomeTotals)}
              />
            </section>

            <section className="report-panel">
              <div className="report-panel-head">
                <h2>영역별 성취</h2>
                <p>단어·문장 복습 결과</p>
              </div>
              <StackedBars
                rows={analytics.bySource.map((row) => ({ label: row.label, segments: OUTCOME_SEGMENTS(row.counts) }))}
              />
              <div className="finish-split" aria-label="통화 종료 유형">
                <h3>통화 종료 유형</h3>
                <StackedBars
                  rows={[
                    {
                      label: "전체 통화",
                      segments: [
                        { key: "completed", label: "정상 완료", value: analytics.finishTotals.completed, tone: "correct" },
                        { key: "stopped", label: "직접 종료", value: analytics.finishTotals.stopped, tone: "stopped" },
                        { key: "no-response", label: "응답 없음", value: analytics.finishTotals["no-response"], tone: "retry" },
                      ],
                    },
                  ]}
                />
                <DailyBarsLegend />
              </div>
            </section>

            <section className="report-panel">
              <div className="report-panel-head">
                <h2>다시 볼 표현</h2>
                <p>통화에서 틀렸던 표현 · 많이 틀린 순</p>
              </div>
              {analytics.missed.length === 0 ? (
                <p className="chart-empty">다시 볼 표현이 없어요. 잘하고 있어요!</p>
              ) : (
                <ol className="missed-list">
                  {analytics.missed.slice(0, 8).map((row) => (
                    <li key={row.answerEn}>
                      <div>
                        <span className="missed-en" lang="en">{row.answerEn}</span>
                        <span className="missed-ko">{row.promptKo}</span>
                        {row.lastAnswer ? <span className="missed-answer">학생 답: <span lang="en">{row.lastAnswer}</span></span> : null}
                      </div>
                      <span className="miss-count">{row.misses}회</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="report-panel">
              <div className="report-panel-head">
                <h2>다음 통화 예정 표현</h2>
                <p>
                  {planned
                    ? `${plannedNote} ${planned.items.length}개 · 학습 오답 ${data.upcoming?.total ?? 0}개 중`
                    : "학습 데이터를 불러오지 못했어요"}
                </p>
              </div>
              {planned && planned.items.length > 0 ? (
                <ul className="upcoming-list">
                  {planned.items.map((item) => (
                    <li key={item.id}>
                      <span className={`source-chip ${item.sourceType}`}>{item.sourceType === "word" ? "단어" : "문장"}</span>
                      <div>
                        <span className="missed-en" lang="en">{item.answerEn}</span>
                        <span className="missed-ko">{item.promptKo}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : planned ? (
                <p className="chart-empty">조회 기간에 틀린 단어·문장이 없어요.</p>
              ) : null}
            </section>
          </div>

          <section className="report-panel calls-panel" aria-labelledby="calls-title">
            <div className="report-panel-head">
              <h2 id="calls-title">통화별 상세 기록</h2>
              <p>최근 통화부터 · 눌러서 표현별 결과와 대화를 펼쳐 봅니다</p>
            </div>
            {reports.length === 0 ? (
              <p className="chart-empty">
                {data.reportsConfigured ? "아직 관리 전화 기록이 없어요." : "통화 결과 저장소가 연결되지 않았어요."}
              </p>
            ) : (
              <ol className="call-timeline">
                {reports.map((report) => {
                  const open = openReportId === report.reportId;
                  const judged = report.targets.filter((target) => target.outcome !== "skipped").length;
                  const correct = report.targets.filter((target) => target.outcome === "correct").length;
                  return (
                    <li className={`call-entry finish-${report.finishReason}`} key={report.reportId}>
                      <button
                        aria-expanded={open}
                        className="call-entry-head"
                        onClick={() => setOpenReportId(open ? null : report.reportId)}
                        type="button"
                      >
                        <span className="call-entry-date">{formatDateTime(report.endedAt)}</span>
                        <span className={`finish-badge ${report.finishReason}`}>{FINISH_LABELS[report.finishReason]}</span>
                        <span className="call-entry-summary">
                          정답 {correct}/{judged || 0} · 다시 볼 {report.needsReviewCount}개
                          {report.conversation.length > 0 ? ` · 대화 ${report.conversation.length}번` : ""}
                        </span>
                        <span className="call-entry-chevron" aria-hidden="true">{open ? "−" : "+"}</span>
                      </button>
                      {open ? (
                        <div className="call-entry-body">
                          <ul className="target-list" aria-label="복습 표현">
                            {report.targets.map((target) => (
                              <li key={target.targetId}>
                                <div>
                                  <span className="target-en" lang="en">{target.answerEn}</span>
                                  <span className="target-ko">{target.promptKo}</span>
                                  {target.attempts && target.attempts.length > 0 ? (
                                    <span className="target-answer">학생 답: <span lang="en">{target.attempts.join(" → ")}</span></span>
                                  ) : target.learnerAnswer ? (
                                    <span className="target-answer">학생 답: <span lang="en">{target.learnerAnswer}</span></span>
                                  ) : null}
                                </div>
                                <span className={`outcome-tag ${target.outcome}`}>{OUTCOME_LABELS[target.outcome]}</span>
                              </li>
                            ))}
                          </ul>
                          {report.conversation.length > 0 ? (
                            <dl className="conversation-list" aria-label="짧은 대화">
                              {report.conversation.map((turn, index) => (
                                <div key={`${report.reportId}-${index}`}>
                                  <dt lang="en">베플리 · {turn.questionEn}</dt>
                                  <dd lang="en">학생 · {turn.answer}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                          {report.talkFeedback ? (
                            <p className="talk-feedback">
                              <strong>학생에게 남긴 대화 피드백</strong>
                              {report.talkFeedback}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <MessageComposer student={student} />
        </>
      ) : null}
    </section>
  );
}
