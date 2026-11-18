"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { DIARY_LEVEL_LABELS, DIARY_MOODS, type DiaryEntry } from "@yoon-call/shared";

import { formatDateTime } from "./format";
import type { SaveStatus } from "./schedule-editor";

const MAX_COMMENT = 120;
const SHOWN_AT_FIRST = 5;
const COMMENT_TEMPLATES = [
  "멋진 문장이에요! 오늘 하루가 잘 느껴져요.",
  "따라 말하기까지 해냈네요. 정말 대단해요!",
  "내일도 영어 일기 기대할게요!",
];

function dateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  const weekday = "일월화수목금토"[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

const SOURCE_LABELS: Record<DiaryEntry["source"], string> = { text: "글로 씀", voice: "말로 씀", photo: "사진으로 씀" };

// 리포트의 영어 한 줄 일기 칸: 학습자가 쓴 일기(한국어 메모·고른 영어 문장·따라 말하기 결과)를 보고 댓글을 남긴다.
// 댓글은 학습자 앱 일기장에 보이고 알림으로도 간다. 다시 쓰면 고쳐진다.
export function DiaryPanel({
  student,
  onEntries,
}: {
  student: { customerNo: string; customerName: string };
  // 불러온(고친) 일기 목록을 리포트에 알린다(다음 통화 예정 표현에 일기 문장 표시).
  onEntries?: (entries: DiaryEntry[]) => void;
}) {
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const url = `/api/call-review/teacher/students/${encodeURIComponent(student.customerNo)}/diary`;

  useEffect(() => {
    let cancelled = false;
    void fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { entries?: DiaryEntry[] } | null;
        if (cancelled) return;
        setFailed(!response.ok);
        setEntries(response.ok ? (body?.entries ?? []) : []);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, refresh]);

  useEffect(() => {
    if (entries) onEntries?.(entries);
  }, [entries, onEntries]);

  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  const replace = useCallback((next: DiaryEntry) => {
    setEntries((current) => (current ?? []).map((entry) => (entry.id === next.id ? next : entry)));
  }, []);

  const shown = showAll ? (entries ?? []) : (entries ?? []).slice(0, SHOWN_AT_FIRST);
  const commented = (entries ?? []).filter((entry) => entry.teacherComment).length;

  return (
    <section className="report-panel diary-panel" aria-labelledby="diary-title">
      <div className="report-panel-head message-panel-head">
        <div>
          <h2 id="diary-title">영어 한 줄 일기</h2>
          <p>
            학습자가 쓴 영어 일기예요. 댓글을 남기면 학습자 앱 일기장과 알림으로 가요.
            {entries && entries.length > 0 ? ` 최근 ${entries.length}개 · 댓글 ${commented}개` : ""}
          </p>
        </div>
        <button className="text-button" onClick={reload} type="button">새로 고침</button>
      </div>

      {entries === null ? null : failed ? (
        <p className="chart-empty">일기를 불러오지 못했어요. 잠시 뒤 새로 고침을 눌러 주세요.</p>
      ) : entries.length === 0 ? (
        <p className="chart-empty">아직 쓴 영어 일기가 없어요.</p>
      ) : (
        <>
          <ul className="diary-list">
            {shown.map((entry) => (
              <DiaryItem key={entry.id} entry={entry} student={student} onSaved={replace} />
            ))}
          </ul>
          {entries.length > SHOWN_AT_FIRST ? (
            <button className="text-button diary-more" onClick={() => setShowAll((value) => !value)} type="button">
              {showAll ? "접기" : `지난 일기 ${entries.length - SHOWN_AT_FIRST}개 더 보기`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function DiaryItem({
  entry,
  student,
  onSaved,
}: {
  entry: DiaryEntry;
  student: { customerNo: string; customerName: string };
  onSaved: (entry: DiaryEntry) => void;
}) {
  const [editing, setEditing] = useState(!entry.teacherComment);
  const [comment, setComment] = useState(entry.teacherComment?.body ?? "");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const text = comment.replace(/\s+/g, " ").trim();
  const mood = DIARY_MOODS.find((item) => item.key === entry.mood);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text || sending) return;
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch(
        `/api/call-review/teacher/students/${encodeURIComponent(student.customerNo)}/diary/${encodeURIComponent(entry.id)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: text }) },
      );
      const body = (await response.json().catch(() => null)) as { entry?: DiaryEntry; reached?: boolean; error?: string } | null;
      if (!response.ok || !body?.entry) {
        setStatus({ tone: "error", text: body?.error ?? "댓글을 남기지 못했어요." });
        return;
      }
      onSaved(body.entry);
      setEditing(false);
      setStatus({
        tone: "ok",
        text: body.reached ? `${student.customerName} 학습자에게 알림을 보냈어요.` : "남겼어요. 학습자가 앱 일기장에서 볼 수 있어요.",
      });
    } catch {
      setStatus({ tone: "error", text: "서버에 연결하지 못했어요." });
    } finally {
      setSending(false);
    }
  }

  return (
    <li className="diary-item">
      <div className="diary-meta">
        <strong>{dateLabel(entry.date)}</strong>
        {mood ? <span title={mood.label}>{mood.emoji} {mood.label}</span> : null}
        <span className="diary-chip">{DIARY_LEVEL_LABELS[entry.level]}</span>
        <span className={`diary-chip ${entry.practice.passed ? "ok" : ""}`}>
          {entry.practice.passed ? "따라 말하기 완료" : entry.practice.attempts > 0 ? "따라 말하기 연습" : "따라 말하기 안 함"}
        </span>
      </div>
      <p className="diary-sentence" lang="en">{entry.sentenceEn}</p>
      <p className="diary-meaning">{entry.meaningKo}</p>
      <p className="diary-note">
        <span>{SOURCE_LABELS[entry.source]}</span>
        {entry.noteKo ? ` · “${entry.noteKo}”` : ""}
        {entry.usedWord ? ` · 배운 단어 ‘${entry.usedWord}’ 사용` : ""}
      </p>

      {entry.teacherComment && !editing ? (
        <div className="diary-comment">
          <div>
            <p>{entry.teacherComment.body}</p>
            <small>
              {formatDateTime(entry.teacherComment.at)} 남김 ·{" "}
              {entry.commentReadAt ? `${formatDateTime(entry.commentReadAt)} 읽음` : "아직 안 읽음"}
            </small>
          </div>
          <button className="text-button" onClick={() => { setEditing(true); setStatus(null); }} type="button">
            고치기
          </button>
        </div>
      ) : (
        <form className="diary-comment-form" onSubmit={(event) => void send(event)}>
          <div className="template-row" role="group" aria-label="자주 쓰는 댓글">
            {COMMENT_TEMPLATES.map((template) => (
              <button className="template-chip" key={template} onClick={() => { setComment(template); setStatus(null); }} type="button">
                {template}
              </button>
            ))}
          </div>
          <label className="field-group">
            <span className="sr-only">댓글</span>
            <textarea
              maxLength={MAX_COMMENT}
              onChange={(event) => {
                setComment(event.target.value);
                setStatus(null);
              }}
              placeholder="일기에 남길 댓글을 짧게 써 주세요."
              rows={2}
              value={comment}
            />
            <small>{comment.length} / {MAX_COMMENT}자</small>
          </label>
          <div className="schedule-actions">
            <button className="secondary-button" disabled={!text || sending} type="submit">
              {sending ? "남기는 중…" : entry.teacherComment ? "댓글 고치기" : "댓글 남기기"}
            </button>
            {entry.teacherComment ? (
              <button className="text-button" onClick={() => { setEditing(false); setComment(entry.teacherComment?.body ?? ""); }} type="button">
                취소
              </button>
            ) : null}
          </div>
        </form>
      )}
      <span className={`schedule-status ${status?.tone ?? ""}`} role="status">
        {status?.text ?? ""}
      </span>
    </li>
  );
}
