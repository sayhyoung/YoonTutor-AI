"use client";

import { type FormEvent, useState } from "react";

import { WEEKDAYS, type ScheduleView, type Weekday } from "./types";

const REMINDERS = [0, 5, 10, 20, 30];

export type ScheduleDraft = { weekdays: Weekday[]; time: string; reminderMinutesBefore: number; active: boolean };

const DEFAULT_DRAFT: ScheduleDraft = { weekdays: ["화", "목"], time: "19:00", reminderMinutesBefore: 10, active: true };

function draftOf(schedule: ScheduleView | null): ScheduleDraft {
  return schedule
    ? {
        weekdays: schedule.weekdays,
        time: schedule.time,
        reminderMinutesBefore: schedule.reminderMinutesBefore,
        active: schedule.active,
      }
    : DEFAULT_DRAFT;
}

export type SaveStatus = { tone: "info" | "ok" | "error"; text: string };

// 관리 전화 일정 입력 폼. 고른 학습자(한 명 또는 여러 명)에게 같은 일정을 저장한다.
// 학습자를 바꾸면 key로 새로 그려 처음 값(한 명이면 그 학습자 일정)부터 시작한다.
export function ScheduleForm({
  initial,
  targetCount,
  onSave,
}: {
  initial: ScheduleView | null;
  targetCount: number;
  onSave: (draft: ScheduleDraft) => Promise<SaveStatus>;
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(() => draftOf(initial));
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const [saving, setSaving] = useState(false);

  function update(changes: Partial<ScheduleDraft>) {
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
    if (targetCount > 1 && !window.confirm(`고른 ${targetCount}명의 일정을 모두 이 일정으로 바꿀까요?`)) return;
    setSaving(true);
    setStatus(null);
    try {
      setStatus(await onSave(draft));
    } finally {
      setSaving(false);
    }
  }

  const invalid = draft.active && draft.weekdays.length === 0;
  const blocked = targetCount === 0;
  return (
    <form className="schedule-editor" onSubmit={(event) => void save(event)} aria-label="관리 전화 일정">
      <fieldset className="field-group" disabled={blocked}>
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
          <input disabled={blocked || !draft.active} onChange={(event) => update({ time: event.target.value })} required type="time" value={draft.time} />
        </label>
        <label className="field-group">
          <span>사전 알림</span>
          <select
            disabled={blocked || !draft.active}
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
        <input checked={!draft.active} disabled={blocked} onChange={(event) => update({ active: !event.target.checked })} type="checkbox" />
        <span>관리 전화 잠시 쉬기</span>
      </label>

      <div className="schedule-actions">
        <button className="secondary-button" disabled={blocked || saving || invalid} type="submit">
          {saving ? "저장하는 중…" : targetCount > 1 ? `${targetCount}명에게 일정 저장` : "일정 저장"}
        </button>
        <span className={`schedule-status ${status?.tone ?? ""}`} role="status">
          {status?.text ??
            (blocked
              ? "왼쪽에서 학습자를 골라 주세요."
              : invalid
                ? "전화 요일을 한 개 이상 골라 주세요."
                : "학습자와 약속한 시간으로 저장해 주세요. 학습자 앱에는 '선생님과 약속한 시간'으로 표시돼요.")}
        </span>
      </div>
    </form>
  );
}
