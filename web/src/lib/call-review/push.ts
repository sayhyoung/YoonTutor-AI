// 서버 푸시(일정 2차): 예약 작업이 몇 분마다 호출하면, 그 사이에 도래한 전화·사전 알림을
// 학생 기기로 보낸다. 같은 회차는 `callDispatches` 기록으로 한 번만 보낸다.

import { type CallScheduleInput, previousCallAt } from "./schedule";

export type DispatchKind = "call" | "reminder";
export type DueEvent = { kind: DispatchKind; at: Date };

// (from, to] 구간에 도래한 전화·사전 알림. 예약 작업 간격을 그대로 구간으로 쓴다.
export function dueEvents(schedule: CallScheduleInput, from: Date, to: Date): DueEvent[] {
  if (!schedule.active) return [];
  const events: DueEvent[] = [];
  const reminderMs = schedule.reminderMinutesBefore * 60 * 1000;

  const call = previousCallAt(schedule, to);
  if (call && call.getTime() > from.getTime()) events.push({ kind: "call", at: call });

  if (reminderMs > 0) {
    // 사전 알림 시각이 (from, to]에 있으려면 해당 회차는 (from+r, to+r]에 있다.
    const upcoming = previousCallAt(schedule, new Date(to.getTime() + reminderMs));
    if (upcoming) {
      const remindAt = new Date(upcoming.getTime() - reminderMs);
      if (remindAt.getTime() > from.getTime() && remindAt.getTime() <= to.getTime()) {
        events.push({ kind: "reminder", at: remindAt });
      }
    }
  }
  return events;
}

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  channelId: string;
  data: { kind: "call-review"; type: DispatchKind };
};

export function buildMessages(tokens: string[], event: DueEvent, reminderMinutes: number): ExpoPushMessage[] {
  const content =
    event.kind === "call"
      ? { title: "베플리 선생님 전화가 왔어요", body: "오늘 복습할 표현으로 짧게 이야기해요. 눌러서 전화를 받아요." }
      : { title: `${reminderMinutes}분 뒤 관리 전화가 와요`, body: "조용한 곳에서 베플리 선생님 전화를 기다려 주세요." };
  return tokens.map((to) => ({
    to,
    ...content,
    sound: "default",
    priority: "high",
    channelId: "call-review",
    data: { kind: "call-review", type: event.kind },
  }));
}

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(value);
}

type ExpoTicket = { status: "ok" | "error"; details?: { error?: string } };

// Expo 푸시 서비스로 보낸다. 더 이상 유효하지 않은 토큰 목록을 돌려준다.
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<{ sent: number; invalidTokens: string[] }> {
  const invalidTokens: string[] = [];
  let sent = 0;
  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) throw new Error(`Expo push ${response.status}`);
    const body = (await response.json()) as { data?: ExpoTicket[] };
    (body.data ?? []).forEach((ticket, ticketIndex) => {
      if (ticket.status === "ok") sent += 1;
      else if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(chunk[ticketIndex]!.to);
    });
  }
  return { sent, invalidTokens };
}
