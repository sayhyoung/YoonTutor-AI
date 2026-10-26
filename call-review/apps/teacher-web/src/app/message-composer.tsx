"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import type { SaveStatus } from "./schedule-editor";
import { formatDateTime } from "./format";
import type { MessageReaction, TeacherMessage } from "./types";

const MAX_MESSAGE = 120;
const MESSAGE_TEMPLATES = [
  "오늘 통화 정말 잘했어요! 다음 통화도 기대할게요.",
  "헷갈린 표현은 다음 통화에서 한 번 더 연습해 봐요. 할 수 있어요!",
  "요즘 꾸준히 통화하고 있네요. 정말 멋져요!",
];

// 학습자 앱의 반응 아이콘과 같다.
const REACTIONS: Record<MessageReaction, { emoji: string; label: string }> = {
  thanks: { emoji: "👍", label: "고마워요" },
  check: { emoji: "✅", label: "확인했어요" },
  love: { emoji: "❤️", label: "좋아요" },
  cheer: { emoji: "💪", label: "힘낼게요" },
};

// 리포트 맨 아래: 담당 교사가 학습자에게 피드백·격려 메시지를 남기고(학습자 앱 메시지함·알림),
// 보낸 메시지마다 학습자가 읽었는지와 보낸 반응을 본다.
export function MessageComposer({ student }: { student: { customerNo: string; customerName: string } }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const [sent, setSent] = useState<TeacherMessage[] | null>(null);
  const text = message.replace(/\s+/g, " ").trim();
  const url = `/api/call-review/teacher/students/${encodeURIComponent(student.customerNo)}/messages`;

  // 보낸 메시지 목록. 새로 고침·발송 뒤에는 refresh 값을 올려 다시 불러온다.
  const [refresh, setRefresh] = useState(0);
  const loadSent = useCallback(() => setRefresh((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    void fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { messages?: TeacherMessage[] } | null;
        if (!cancelled) setSent(response.ok ? (body?.messages ?? []) : []);
      })
      .catch(() => {
        if (!cancelled) setSent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [url, refresh]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text) return;
    if (!window.confirm(`${student.customerName} 학습자에게 이 메시지를 보낼까요?\n\n"${text}"`)) return;
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/call-review/teacher/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerNos: [student.customerNo], message: text }),
      });
      const body = (await response.json().catch(() => null)) as { saved?: number; reached?: number; error?: string } | null;
      if (!response.ok || !body?.saved) {
        setStatus({ tone: "error", text: body?.error ?? "메시지를 보내지 못했어요." });
        return;
      }
      setStatus(
        body.reached
          ? { tone: "ok", text: `${student.customerName} 학습자에게 보냈어요.` }
          : { tone: "ok", text: "보냈어요. 학습자 앱 알림이 꺼져 있어, 앱을 열면 메시지함에서 볼 수 있어요." },
      );
      setMessage("");
      loadSent();
    } catch {
      setStatus({ tone: "error", text: "서버에 연결하지 못했어요." });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="report-panel message-panel" aria-labelledby="message-title">
      <div className="report-panel-head message-panel-head">
        <div>
          <h2 id="message-title">학습자에게 메시지 보내기</h2>
          <p>리포트를 보고 피드백이나 격려를 남겨요. 학습자 앱 알림과 메시지함으로 가요.</p>
        </div>
        <button className="text-button" onClick={loadSent} type="button">새로 고침</button>
      </div>

      {sent && sent.length > 0 ? (
        <ul className="sent-list" aria-label="보낸 메시지">
          {sent.map((item) => {
            const reaction = item.reaction ? REACTIONS[item.reaction] : null;
            return (
              <li key={item.id}>
                <div className="sent-copy">
                  <p>{item.body}</p>
                  <small>
                    {formatDateTime(item.sentAt)} 보냄 · {item.readAt ? `${formatDateTime(item.readAt)} 읽음` : "아직 안 읽음"}
                  </small>
                </div>
                {reaction ? (
                  <span className="sent-reaction" title={`${formatDateTime(item.reactedAt ?? item.readAt ?? item.sentAt)} 반응`}>
                    <span aria-hidden="true">{reaction.emoji}</span> {reaction.label}
                  </span>
                ) : (
                  <span className={`sent-state${item.readAt ? " read" : ""}`}>{item.readAt ? "읽음" : "안 읽음"}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : sent ? (
        <p className="chart-empty sent-empty">아직 보낸 메시지가 없어요.</p>
      ) : null}

      <form className="message-form" onSubmit={(event) => void send(event)}>
        <div className="template-row" role="group" aria-label="자주 쓰는 메시지">
          {MESSAGE_TEMPLATES.map((template) => (
            <button className="template-chip" key={template} onClick={() => { setMessage(template); setStatus(null); }} type="button">
              {template}
            </button>
          ))}
        </div>
        <label className="field-group">
          <span>메시지</span>
          <textarea
            maxLength={MAX_MESSAGE}
            onChange={(event) => {
              setMessage(event.target.value);
              setStatus(null);
            }}
            placeholder="학습자에게 보낼 말을 짧게 써 주세요."
            rows={3}
            value={message}
          />
          <small>{message.length} / {MAX_MESSAGE}자 · 학습자는 👍 ✅ ❤️ 💪 중 하나로 반응할 수 있어요.</small>
        </label>
        <div className="schedule-actions">
          <button className="secondary-button" disabled={!text || sending} type="submit">
            {sending ? "보내는 중…" : "메시지 보내기"}
          </button>
          <span className={`schedule-status ${status?.tone ?? ""}`} role="status">
            {status?.text ?? ""}
          </span>
        </div>
      </form>
    </section>
  );
}
