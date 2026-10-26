"use client";

import { type FormEvent, useMemo, useState } from "react";

import { type SaveStatus, type ScheduleDraft, ScheduleForm } from "./schedule-editor";
import { BM_LABELS } from "./student-report";
import type { ScheduleView, TeacherStudentRow } from "./types";

const MAX_MESSAGE = 120;
const MESSAGE_TEMPLATES = [
  "오늘 베플리 선생님 전화 잊지 마세요!",
  "이번 주 관리 전화 시간이 바뀌었어요. 앱에서 확인해 주세요.",
  "지난 통화 정말 잘했어요. 다음 통화도 기대할게요!",
];

type StudentFilter = "전체" | "일정 없음" | "쉬는 중";

function scheduleText(schedule: ScheduleView | null) {
  if (!schedule) return "일정 없음";
  if (!schedule.active) return "쉬는 중";
  return `${schedule.weekdays.join("·")} ${schedule.time}`;
}

// 운영 설정: 학습자를 한 명 이상 골라 관리 전화 일정을 한꺼번에 저장하고, 앱 알림으로 메시지를 보낸다.
export function OperationsSettings({ students, onChanged }: { students: TeacherStudentRow[]; onChanged: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("전체");

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return students.filter((student) => {
      if (text && !student.customerName.toLowerCase().includes(text)) return false;
      if (filter === "일정 없음") return !student.schedule;
      if (filter === "쉬는 중") return student.schedule ? !student.schedule.active : false;
      return true;
    });
  }, [filter, query, students]);

  const selected = students.filter((student) => picked.has(student.customerNo));
  const allVisiblePicked = visible.length > 0 && visible.every((student) => picked.has(student.customerNo));

  function toggle(customerNo: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(customerNo)) next.delete(customerNo);
      else next.add(customerNo);
      return next;
    });
  }

  function toggleVisible() {
    setPicked((current) => {
      const next = new Set(current);
      for (const student of visible) {
        if (allVisiblePicked) next.delete(student.customerNo);
        else next.add(student.customerNo);
      }
      return next;
    });
  }

  async function saveSchedule(draft: ScheduleDraft): Promise<SaveStatus> {
    try {
      const response = await fetch("/api/call-review/teacher/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerNos: selected.map((student) => student.customerNo), schedule: draft }),
      });
      const body = (await response.json().catch(() => null)) as
        | { saved?: { customerNo: string; schedule: ScheduleView }[]; failed?: string[]; error?: string }
        | null;
      if (!response.ok || !body?.saved) return { tone: "error", text: body?.error ?? "일정을 저장하지 못했어요." };
      onChanged();
      const failed = body.failed?.length ?? 0;
      if (failed > 0) return { tone: "error", text: `${body.saved.length}명은 저장했지만 ${failed}명은 저장하지 못했어요. 다시 시도해 주세요.` };
      const next = body.saved[0]?.schedule.nextCallLabel;
      if (body.saved.length === 1) {
        return { tone: "ok", text: next ? `저장했어요. 다음 관리 전화는 ${next}이에요.` : "저장했어요. 관리 전화를 쉬는 중이에요." };
      }
      return { tone: "ok", text: `${body.saved.length}명의 일정을 저장했어요.${next ? ` 다음 관리 전화는 ${next}이에요.` : ""}` };
    } catch {
      return { tone: "error", text: "서버에 연결하지 못했어요." };
    }
  }

  const single = selected.length === 1 ? selected[0]! : null;
  return (
    <>
      <header className="overview-hero">
        <div className="overview-hero-top">
          <div>
            <p className="report-hero-eyebrow">윤선생 교사 LMS · AI 관리 전화</p>
            <h1>운영 설정</h1>
            <p className="overview-hero-copy">학습자를 골라 관리 전화 일정을 한꺼번에 정하고, 학습자 앱으로 메시지를 보내요.</p>
          </div>
        </div>
      </header>

      <div className="settings-grid">
        <section className="report-panel student-picker" aria-labelledby="picker-title">
          <div className="report-panel-head picker-head">
            <div>
              <h2 id="picker-title">학습자 선택</h2>
              <p>{selected.length > 0 ? `${selected.length}명 골랐어요` : "일정을 정하거나 메시지를 보낼 학습자를 골라요"}</p>
            </div>
            {selected.length > 0 ? (
              <button className="text-button" onClick={() => setPicked(new Set())} type="button">선택 해제</button>
            ) : null}
          </div>
          <input
            aria-label="학습자 이름 검색"
            className="picker-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름으로 찾기"
            type="search"
            value={query}
          />
          <div className="filter-row" role="group" aria-label="일정 상태 필터">
            {(["전체", "일정 없음", "쉬는 중"] as StudentFilter[]).map((item) => (
              <button
                aria-pressed={filter === item}
                className={`filter-button${filter === item ? " active" : ""}`}
                key={item}
                onClick={() => setFilter(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="chart-empty">{students.length === 0 ? "담당 학습자가 없어요." : "조건에 맞는 학습자가 없어요."}</p>
          ) : (
            <>
              <label className="picker-row picker-all">
                <input checked={allVisiblePicked} onChange={toggleVisible} type="checkbox" />
                <span>{query || filter !== "전체" ? `보이는 ${visible.length}명 모두 선택` : `전체 ${visible.length}명 선택`}</span>
              </label>
              <ul className="picker-list">
                {visible.map((student) => (
                  <li key={student.customerNo}>
                    <label className="picker-row">
                      <input checked={picked.has(student.customerNo)} onChange={() => toggle(student.customerNo)} type="checkbox" />
                      <span className="picker-name">
                        {student.customerName}
                        <small>
                          {[student.schoolYear ? `${student.schoolYear}학년` : null, ...student.bmNames.map((bm) => BM_LABELS[bm] ?? bm)]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                      <span className={`picker-schedule${student.schedule?.active ? "" : " none"}`}>{scheduleText(student.schedule)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="settings-actions">
          <section className="report-panel" aria-labelledby="schedule-title">
            <div className="report-panel-head">
              <h2 id="schedule-title">전화 일정 설정</h2>
              <p>
                {selected.length === 0
                  ? "학습자와 약속한 전화 요일·시간과 사전 알림을 정해요."
                  : single
                    ? `${single.customerName} · 지금 일정: ${scheduleText(single.schedule)}`
                    : `고른 ${selected.length}명에게 같은 일정을 저장해요. 지금 일정은 덮어써요.`}
              </p>
            </div>
            <ScheduleForm
              initial={single?.schedule ?? null}
              key={single ? single.customerNo : `many-${selected.length > 0}`}
              onSave={saveSchedule}
              targetCount={selected.length}
            />
          </section>

          <MessageComposer students={selected} />
        </div>
      </div>
    </>
  );
}

function MessageComposer({ students }: { students: TeacherStudentRow[] }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const text = message.replace(/\s+/g, " ").trim();
  const blocked = students.length === 0;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text || blocked) return;
    if (!window.confirm(`${students.length}명에게 이 메시지를 앱 알림으로 보낼까요?\n\n"${text}"`)) return;
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/call-review/teacher/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerNos: students.map((student) => student.customerNo), message: text }),
      });
      const body = (await response.json().catch(() => null)) as { reached?: number; noDevice?: number; error?: string } | null;
      if (!response.ok || typeof body?.reached !== "number") {
        setStatus({ tone: "error", text: body?.error ?? "메시지를 보내지 못했어요." });
        return;
      }
      const missing = body.noDevice ?? 0;
      setStatus(
        body.reached === 0
          ? { tone: "error", text: "앱 알림을 받을 수 있는 학습자가 없어요. 학습자 앱에서 알림을 허용해야 받을 수 있어요." }
          : { tone: "ok", text: `${body.reached}명에게 보냈어요.${missing > 0 ? ` 앱 알림을 켜지 않은 ${missing}명은 받지 못했어요.` : ""}` },
      );
      if (body.reached > 0) setMessage("");
    } catch {
      setStatus({ tone: "error", text: "서버에 연결하지 못했어요." });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="report-panel" aria-labelledby="message-title">
      <div className="report-panel-head">
        <h2 id="message-title">메시지 보내기</h2>
        <p>{blocked ? "고른 학습자의 앱으로 알림 메시지를 보내요." : `고른 ${students.length}명의 앱으로 알림 메시지를 보내요.`}</p>
      </div>
      <form className="message-form" onSubmit={(event) => void send(event)}>
        <div className="template-row" role="group" aria-label="자주 쓰는 메시지">
          {MESSAGE_TEMPLATES.map((template) => (
            <button className="template-chip" disabled={blocked} key={template} onClick={() => { setMessage(template); setStatus(null); }} type="button">
              {template}
            </button>
          ))}
        </div>
        <label className="field-group">
          <span>메시지</span>
          <textarea
            disabled={blocked}
            maxLength={MAX_MESSAGE}
            onChange={(event) => {
              setMessage(event.target.value);
              setStatus(null);
            }}
            placeholder="학습자에게 보낼 말을 짧게 써 주세요."
            rows={3}
            value={message}
          />
          <small>{message.length} / {MAX_MESSAGE}자 · 알림 제목은 &lsquo;선생님의 메시지&rsquo;로 보여요.</small>
        </label>
        <div className="schedule-actions">
          <button className="secondary-button" disabled={blocked || !text || sending} type="submit">
            {sending ? "보내는 중…" : blocked ? "메시지 보내기" : `${students.length}명에게 보내기`}
          </button>
          <span className={`schedule-status ${status?.tone ?? ""}`} role="status">
            {status?.text ?? (blocked ? "왼쪽에서 학습자를 골라 주세요." : "")}
          </span>
        </div>
      </form>
    </section>
  );
}
