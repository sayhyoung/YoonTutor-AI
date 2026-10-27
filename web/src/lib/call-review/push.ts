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

// FCM으로 보낼 알림 내용. data 값은 문자열이어야 하고, 앱은 data.kind/type으로 전화 알림을 구분한다.
// message(선생님이 보낸 메시지)는 눌러도 앱만 열리고 전화 화면으로 가지 않는다.
// dataOnly: 시스템 알림 없이 data만 보낸다. 안드로이드 앱이 직접 전화 수신 화면(벨·진동)과
// 확인할 때까지 남는 사전 알림을 띄운다. data의 title·message는 예전 앱이 기본 알림을 띄울 때 쓴다.
export type PushContent = {
  title: string;
  body: string;
  data: { kind: "call-review"; type: DispatchKind | "message"; messageId?: string; title?: string; message?: string };
  dataOnly?: boolean;
  // 이 시간이 지나도록 기기에 전달하지 못하면 버린다(지난 전화가 뒤늦게 울리지 않게).
  ttlSeconds?: number;
};

export const MAX_TEACHER_MESSAGE = 120;

// 교사가 담당 학생에게 보내는 메시지 알림. 앱은 messageId로 해당 메시지를 연다.
export function buildTeacherMessage(body: string, teacherName: string | null, messageId?: string): PushContent {
  return {
    title: teacherName ? `${teacherName} 선생님의 메시지` : "선생님의 메시지",
    body,
    data: { kind: "call-review", type: "message", ...(messageId ? { messageId } : {}) },
  };
}

// 예약 작업이 5분마다 돌므로 전화 푸시는 5분 안에만 전달한다.
const CALL_TTL_SECONDS = 5 * 60;

export function buildPushContent(event: DueEvent, reminderMinutes: number): PushContent {
  const content =
    event.kind === "call"
      ? { title: "베플리 선생님 전화가 왔어요", body: "오늘 복습할 표현으로 짧게 이야기해요. 눌러서 전화를 받아요." }
      : { title: `${reminderMinutes}분 뒤 관리 전화가 와요`, body: "조용한 곳에서 베플리 선생님 전화를 기다려 주세요." };
  return {
    ...content,
    data: { kind: "call-review", type: event.kind, title: content.title, message: content.body },
    dataOnly: true,
    ttlSeconds: event.kind === "call" ? CALL_TTL_SECONDS : Math.max(reminderMinutes * 60, 60),
  };
}

// FCM 등록 토큰(기기 토큰). 형식이 공개돼 있지 않아 길이·문자 범위만 본다.
export function isPushToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 4096 && /^[A-Za-z0-9:_-]+$/.test(value);
}

// 앱을 지웠거나 토큰이 바뀌어 다시 보낼 수 없는 경우. 이 토큰은 저장소에서 지운다.
const INVALID_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export type SendResult = { success: boolean; error?: { code?: string } };

export function invalidTokensFrom(tokens: string[], responses: SendResult[]): string[] {
  return responses.flatMap((response, index) =>
    !response.success && INVALID_TOKEN_ERRORS.has(response.error?.code ?? "") ? [tokens[index]!] : [],
  );
}

const ANDROID_CHANNEL_ID = "call-review";
const MULTICAST_LIMIT = 500;

// FCM(firebase-admin)으로 바로 보낸다. 더 이상 유효하지 않은 토큰 목록을 돌려준다.
export async function sendPush(tokens: string[], content: PushContent): Promise<{ sent: number; invalidTokens: string[] }> {
  const { getMessaging } = await import("firebase-admin/messaging");
  const { adminApp } = await import("./admin-db");
  const messaging = getMessaging(await adminApp());
  const invalidTokens: string[] = [];
  let sent = 0;
  for (let index = 0; index < tokens.length; index += MULTICAST_LIMIT) {
    const chunk = tokens.slice(index, index + MULTICAST_LIMIT);
    const ttl = content.ttlSeconds ? content.ttlSeconds * 1000 : undefined;
    const result = await messaging.sendEachForMulticast(
      content.dataOnly
        ? {
            tokens: chunk,
            data: content.data,
            android: { priority: "high", ...(ttl ? { ttl } : {}) },
            apns: { headers: { "apns-priority": "10" }, payload: { aps: { alert: { title: content.title, body: content.body }, sound: "default" } } },
          }
        : {
            tokens: chunk,
            notification: { title: content.title, body: content.body },
            data: content.data,
            android: { priority: "high", ...(ttl ? { ttl } : {}), notification: { channelId: ANDROID_CHANNEL_ID, sound: "default" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
    );
    sent += result.successCount;
    invalidTokens.push(...invalidTokensFrom(chunk, result.responses));
  }
  return { sent, invalidTokens };
}
