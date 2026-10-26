"use client";

import { type FormEvent, useState } from "react";

import type { SaveStatus } from "./schedule-editor";

const MAX_MESSAGE = 120;
const MESSAGE_TEMPLATES = [
  "오늘 통화 정말 잘했어요! 다음 통화도 기대할게요.",
  "헷갈린 표현은 다음 통화에서 한 번 더 연습해 봐요. 할 수 있어요!",
  "요즘 꾸준히 통화하고 있네요. 정말 멋져요!",
];

// 리포트 맨 아래: 담당 교사가 학습자 앱으로 피드백·격려 메시지를 알림으로 보낸다.
export function MessageComposer({ student }: { student: { customerNo: string; customerName: string } }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const text = message.replace(/\s+/g, " ").trim();

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text) return;
    if (!window.confirm(`${student.customerName} 학습자에게 이 메시지를 앱 알림으로 보낼까요?\n\n"${text}"`)) return;
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/call-review/teacher/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerNos: [student.customerNo], message: text }),
      });
      const body = (await response.json().catch(() => null)) as { reached?: number; noDevice?: number; error?: string } | null;
      if (!response.ok || typeof body?.reached !== "number") {
        setStatus({ tone: "error", text: body?.error ?? "메시지를 보내지 못했어요." });
        return;
      }
      setStatus(
        body.reached === 0
          ? { tone: "error", text: "학습자 앱에서 알림을 허용하지 않아 보내지 못했어요." }
          : { tone: "ok", text: `${student.customerName} 학습자에게 보냈어요.` },
      );
      if (body.reached > 0) setMessage("");
    } catch {
      setStatus({ tone: "error", text: "서버에 연결하지 못했어요." });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="report-panel message-panel" aria-labelledby="message-title">
      <div className="report-panel-head">
        <h2 id="message-title">학습자에게 메시지 보내기</h2>
        <p>리포트를 보고 피드백이나 격려를 남겨요. 학습자 앱에 알림으로 가요.</p>
      </div>
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
          <small>{message.length} / {MAX_MESSAGE}자 · 알림 제목은 &lsquo;선생님의 메시지&rsquo;로 보여요.</small>
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
