"use client";

import { type FormEvent, useEffect, useState } from "react";

import { WEEKDAYS, type ScheduleView, type Weekday } from "./types";

const REMINDERS = [0, 5, 10, 20, 30];

type Draft = { weekdays: Weekday[]; time: string; reminderMinutesBefore: number; active: boolean };

const DEFAULT_DRAFT: Draft = { weekdays: ["화", "목"], time: "19:00", reminderMinutesBefore: 10, active: true };

function draftOf(schedule: ScheduleView | null): Draft {
  return schedule
    ? {
        weekdays: schedule.weekdays,
        time: schedule.time,
        reminderMinutesBefore: schedule.reminderMinutesBefore,
        active: schedule.active,
      }
    : DEFAULT_DRAFT;
}

// 학습자 한 명의 관리 전화 일정. 담당 교사만 저장할 수 있고 학생 앱에서는 읽기만 한다.
export function ScheduleEditor({
  customerNo,
  studentName,
  onSaved,
}: {
  customerNo: string;
  studentName: string;
  onSaved?: (schedule: ScheduleView) => void;
}) {
  const [loaded, setLoaded] = useState<ScheduleView | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const url = `/api/call-review/teacher/students/${encodeURIComponent(customerNo)}/schedule`;

  useEffect(() => {
    let cancelled = false;
    void fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { schedule?: ScheduleView | null; error?: string } | null;
        if (cancelled) return;
        if (!response.ok) {
          setLoaded(null);
          setStatus({ tone: "error", text: body?.error ?? "일정을 불러오지 못했어요." });
          return;
        }
        setLoaded(body?.schedule ?? null);
        setDraft(draftOf(body?.schedule ?? null));
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(null);
          setStatus({ tone: "error", text: "서버에 연결하지 못했어요." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function update(changes: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setStatus(null);
  }

  function toggleDay(day: Weekday) {
    const next = draft.weekdays.includes(day)
      ? draft.weekdays.filter((item) => item !== day)
      : [...draft.weekdays, day];
    update({ weekdays: WEEKDAYS.filter((item) => next.includes(item)) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json().catch(() => null)) as { schedule?: ScheduleView; error?: string } | null;
      if (!response.ok || !body?.schedule) {
        setStatus({ tone: "error", text: body?.error ?? "일정을 저장하지 못했어요." });
        return;
      }
      setLoaded(body.schedule);
      setDraft(draftOf(body.schedule));
      setStatus({
        tone: "ok",
        text: body.schedule.nextCallLabel
          ? `저장했어요. 다음 관리 전화는 ${body.schedule.nextCallLabel}이에요.`
          : "저장했어요. 관리 전화를 쉬는 중이에요.",
      });
      onSaved?.(body.schedule);
    } catch {
      setStatus({ tone: "error", text: "서버에 연결하지 못했어요." });
    } finally {
      setSaving(false);
    }
  }

  if (loaded === undefined) return <p className="detail-loading">일정을 불러오는 중…</p>;

  const invalid = draft.active && draft.weekdays.length === 0;
  return (
    <form className="schedule-editor" onSubmit={(event) => void save(event)} aria-label={`${studentName} 전화 일정`}>
      <div className="schedule-summary">
        {loaded?.nextCallLabel ? (
          <>
            <span className="schedule-next-label">다음 관리 전화</span>
            <strong>{loaded.nextCallLabel}</strong>
            <small>
              주 {loaded.callsPerWeek}회 · {loaded.weekdays.join("·")} {loaded.time}
              {loaded.updatedByName ? ` · ${loaded.updatedByName} 선생님이 설정` : ""}
            </small>
          </>
        ) : (
          <>
            <span className="schedule-next-label">다음 관리 전화</span>
            <strong>{loaded ? "쉬는 중" : "아직 일정이 없어요"}</strong>
            <small>요일과 시간을 정하면 학습자 앱에 바로 표시돼요.</small>
          </>
        )}
      </div>

      <fieldset className="field-group">
        <legend>전화 요일</legend>
        <div className="weekday-row">
          {WEEKDAYS.map((day) => {
            const on = draft.weekdays.includes(day);
            return (
              <button
                aria-pressed={on}
                className={`weekday-button${on ? " active" : ""}`}
                disabled={!draft.active}
                key={day}
                onClick={() => toggleDay(day)}
                type="button"
              >
                {day}
              </button>
            );
          })}
        </div>
        <small>{draft.active ? `주 ${draft.weekdays.length}회 전화해요.` : "쉬는 동안에는 전화가 오지 않아요."}</small>
      </fieldset>

      <div className="schedule-fields">
        <label className="field-group">
          <span>전화 시간</span>
          <input disabled={!draft.active} onChange={(event) => update({ time: event.target.value })} required type="time" value={draft.time} />
        </label>
        <label className="field-group">
          <span>사전 알림</span>
          <select
            disabled={!draft.active}
            onChange={(event) => update({ reminderMinutesBefore: Number(event.target.value) })}
            value={draft.reminderMinutesBefore}
          >
            {REMINDERS.map((minutes) => (
              <option key={minutes} value={minutes}>{minutes === 0 ? "알림 없음" : `${minutes}분 전`}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="pause-toggle">
        <input checked={!draft.active} onChange={(event) => update({ active: !event.target.checked })} type="checkbox" />
        <span>관리 전화 잠시 쉬기</span>
      </label>

      <div className="schedule-actions">
        <button className="secondary-button" disabled={saving || invalid} type="submit">
          {saving ? "저장하는 중…" : "일정 저장"}
        </button>
        <span className={`schedule-status ${status?.tone ?? ""}`} role="status">
          {status?.text ?? (invalid ? "전화 요일을 한 개 이상 골라 주세요." : "학습자는 이 일정을 앱에서 확인만 할 수 있어요.")}
        </span>
      </div>
    </form>
  );
}
