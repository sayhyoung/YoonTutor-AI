"use client";

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
import { useMemo, useState } from "react";

import type {
  TeacherCallRow,
  TeacherScheduleSettings,
} from "@yoon-call/shared";

const previewRows: TeacherCallRow[] = [
  {
    id: "student-a",
    studentLabel: "학생 A",
    status: "완료",
    scheduledAtLabel: "오늘 18:30",
    focusLabel: "과거형 문장",
    followUpLabel: "다음 통화에서 표현 1개 재확인",
  },
  {
    id: "student-b",
    studentLabel: "학생 B",
    status: "예정",
    scheduledAtLabel: "오늘 19:10",
    focusLabel: "단어·어휘",
    followUpLabel: "통화 예정",
  },
  {
    id: "student-c",
    studentLabel: "학생 C",
    status: "재통화 필요",
    scheduledAtLabel: "오늘 17:40",
    focusLabel: "문장 어순",
    followUpLabel: "학생과 시간 재조정 필요",
  },
  {
    id: "student-d",
    studentLabel: "학생 D",
    status: "완료",
    scheduledAtLabel: "어제 20:00",
    focusLabel: "숙어 표현",
    followUpLabel: "다음 관리 주기에 다시 확인",
  },
];

type Filter = "전체" | TeacherCallRow["status"];
const weekdays = ["월", "화", "수", "목", "금"];

export default function TeacherDashboard() {
  const [filter, setFilter] = useState<Filter>("전체");
  const [selected, setSelected] = useState<TeacherCallRow | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [schedule, setSchedule] = useState<TeacherScheduleSettings>({
    studentLabel: "학생 A",
    weekdays: ["화", "목"],
    time: "19:30",
    callsPerWeek: 2,
    reminderMinutesBefore: 10,
    managedBy: "teacher",
  });
  const filteredRows = useMemo(
    () =>
      filter === "전체"
        ? previewRows
        : previewRows.filter((row) => row.status === filter),
    [filter],
  );

  function updateSchedule(
    updates: Partial<Omit<TeacherScheduleSettings, "managedBy">>,
  ) {
    setSchedule((current) => ({ ...current, ...updates }));
    setScheduleSaved(false);
  }

  function toggleWeekday(day: string) {
    const weekdaysNext = (schedule.weekdays.includes(day)
      ? schedule.weekdays.filter((item) => item !== day)
      : [...schedule.weekdays, day]
    ).sort((a, b) => weekdays.indexOf(a) - weekdays.indexOf(b));
    updateSchedule({ weekdays: weekdaysNext });
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar" aria-label="교사 관리 메뉴">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">윤</span>
          <div>
            <strong>AI 전화관리</strong>
            <span>교사용 프리뷰</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <a className="nav-link active" href="#calls">관리 전화</a>
          <a className="nav-link" href="#students">학습자</a>
          <a className="nav-link" href="#settings">운영 설정</a>
        </nav>
        <p className="preview-notice">
          현재 화면은 프리뷰 데이터입니다. 실제 학습자 연동 전에는 저장되지 않습니다.
        </p>
      </aside>

      <section className="dashboard-main" id="calls">
        <header className="page-header">
          <div>
            <p className="eyebrow">윤선생 교사 LMS 연결 화면</p>
            <h1>AI 관리 전화 현황</h1>
            <p className="page-description">
              누가 통화를 마쳤고, 어떤 표현을 다음에 다시 확인해야 하는지 한눈에 봅니다.
            </p>
          </div>
          <a className="secondary-button" href="#settings">일정 설정</a>
        </header>

        <section className="status-strip" aria-label="오늘의 운영 상태">
          <StatusItem label="완료" value="2" detail="프리뷰" />
          <StatusItem label="예정" value="1" detail="프리뷰" />
          <StatusItem label="재통화 필요" value="1" detail="프리뷰" emphasis />
        </section>

        <div className="workbench">
          <section className="call-list" id="students" aria-label="관리 전화 목록">
            <div className="section-heading">
              <div>
                <h2>관리 대상</h2>
                <p>통화 결과와 후속 관리가 필요한 항목을 확인합니다.</p>
              </div>
              <div className="filter-row" role="group" aria-label="상태 필터">
                {(["전체", "예정", "완료", "재통화 필요"] as Filter[]).map((item) => (
                  <button
                    className={`filter-button${filter === item ? " active" : ""}`}
                    key={item}
                    onClick={() => setFilter(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>학습자</th>
                    <th>상태</th>
                    <th>통화 시간</th>
                    <th>집중 항목</th>
                    <th>후속 관리</th>
                    <th><span className="sr-only">상세</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="학습자"><strong>{row.studentLabel}</strong></td>
                      <td data-label="상태"><StatusBadge status={row.status} /></td>
                      <td data-label="통화 시간">{row.scheduledAtLabel}</td>
                      <td data-label="집중 항목">{row.focusLabel}</td>
                      <td data-label="후속 관리">{row.followUpLabel}</td>
                      <td>
                        <button className="text-button" onClick={() => setSelected(row)} type="button">
                          자세히
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="detail-panel" aria-live="polite">
            {selected ? (
              <>
                <div className="detail-heading">
                  <div>
                    <span>선택한 학습자</span>
                    <h2>{selected.studentLabel}</h2>
                  </div>
                  <button className="icon-button" onClick={() => setSelected(null)} type="button" aria-label="상세 닫기">×</button>
                </div>
                <dl className="detail-list">
                  <div><dt>통화 상태</dt><dd><StatusBadge status={selected.status} /></dd></div>
                  <div><dt>집중 항목</dt><dd>{selected.focusLabel}</dd></div>
                  <div><dt>후속 관리</dt><dd>{selected.followUpLabel}</dd></div>
                </dl>
                <div className="empty-analysis">
                  <strong>실제 연동 후 표시</strong>
                  <p>통화 요약, 사용한 표현, 다시 확인할 항목이 이 영역에 표시됩니다.</p>
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <span className="detail-empty-mark" aria-hidden="true">↗</span>
                <h2>학습자를 선택해 주세요</h2>
                <p>목록의 ‘자세히’를 누르면 통화 결과와 후속 관리 내용을 볼 수 있습니다.</p>
              </div>
            )}
          </aside>
        </div>

        <section className="schedule-section" id="settings" aria-labelledby="schedule-title">
          <div className="schedule-heading">
            <div>
              <h2 id="schedule-title">전화 일정 설정</h2>
              <p>담당 교사가 학습자의 전화 요일과 빈도를 정합니다.</p>
            </div>
            <span className="authority-badge">교사 권한</span>
          </div>

          <form
            className="schedule-form"
            onSubmit={(event) => {
              event.preventDefault();
              setScheduleSaved(true);
            }}
          >
            <label className="field-group">
              <span>학습자</span>
              <select
                value={schedule.studentLabel}
                onChange={(event) => updateSchedule({ studentLabel: event.target.value })}
              >
                {previewRows.map((row) => (
                  <option key={row.id} value={row.studentLabel}>{row.studentLabel}</option>
                ))}
              </select>
              <small>학생 화면에서는 일정 확인만 가능합니다.</small>
            </label>

            <fieldset className="field-group weekday-field">
              <legend>전화 요일</legend>
              <div className="weekday-row">
                {weekdays.map((day) => {
                  const active = schedule.weekdays.includes(day);
                  return (
                    <button
                      aria-pressed={active}
                      className={`weekday-button${active ? " active" : ""}`}
                      key={day}
                      onClick={() => toggleWeekday(day)}
                      type="button"
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <small>선택한 요일에 앱으로 관리 전화가 도착합니다.</small>
            </fieldset>

            <label className="field-group">
              <span>전화 시간</span>
              <input
                type="time"
                value={schedule.time}
                onChange={(event) => updateSchedule({ time: event.target.value })}
              />
              <small>학습자의 수업 시간을 피해 설정해 주세요.</small>
            </label>

            <label className="field-group">
              <span>주간 빈도</span>
              <select
                value={schedule.callsPerWeek}
                onChange={(event) => updateSchedule({ callsPerWeek: Number(event.target.value) })}
              >
                <option value={1}>주 1회</option>
                <option value={2}>주 2회</option>
                <option value={3}>주 3회</option>
              </select>
              <small>복습할 학습량에 따라 횟수를 조정합니다.</small>
            </label>

            <label className="field-group">
              <span>사전 알림</span>
              <select
                value={schedule.reminderMinutesBefore}
                onChange={(event) => updateSchedule({ reminderMinutesBefore: Number(event.target.value) })}
              >
                <option value={5}>5분 전</option>
                <option value={10}>10분 전</option>
                <option value={20}>20분 전</option>
              </select>
              <small>학습자 앱의 푸시 알림 기준입니다.</small>
            </label>

            <div className="schedule-actions">
              <button
                className="secondary-button"
                disabled={schedule.weekdays.length === 0}
                type="submit"
              >
                일정 저장
              </button>
              <span className="schedule-status" role="status">
                {scheduleSaved
                  ? `${schedule.studentLabel} · ${schedule.weekdays.join("·")}요일 ${schedule.time}에 반영됨`
                  : schedule.weekdays.length === 0
                    ? "전화 요일을 한 개 이상 선택해 주세요."
                    : "변경한 일정은 저장 후 학습자 앱에 표시됩니다."}
              </span>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}

function StatusItem({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasis?: boolean;
}) {
  return (
    <article className={`status-item${emphasis ? " emphasis" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function StatusBadge({ status }: { status: TeacherCallRow["status"] }) {
  const statusClass =
    status === "완료" ? "complete" : status === "예정" ? "scheduled" : "retry";
  return <span className={`status-badge ${statusClass}`}>{status}</span>;
}
