import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import type { ApiSchedule } from "./callReviewApi";

// 교사가 정한 일정으로 기기 자체 알림을 매주 반복 예약한다(서버 푸시 전 1차 방식).
// 앱을 열 때마다 받아 온 일정으로 다시 맞추므로, 교사가 바꾼 일정은 다음 실행 때 반영된다.
// 기기가 한국 시간대라고 가정한다(일정 시각은 KST).

const CHANNEL_ID = "call-review";
const KIND = "call-review";
// expo-notifications 요일: 1=일요일 … 7=토요일
const WEEKDAY_NUMBER: Record<string, number> = { 일: 1, 월: 2, 화: 3, 수: 4, 목: 5, 금: 6, 토: 7 };

export type CallNotificationKind = "call" | "reminder";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function shiftMinutes(weekday: number, hour: number, minute: number, delta: number) {
  const week = 7 * 24 * 60;
  const total = ((((weekday - 1) * 24 * 60 + hour * 60 + minute + delta) % week) + week) % week;
  return { weekday: Math.floor(total / (24 * 60)) + 1, hour: Math.floor((total % (24 * 60)) / 60), minute: total % 60 };
}

// 로그아웃 때 서버 등록을 해제하려고 이번 실행에서 등록한 토큰을 기억해 둔다.
let registeredPushToken: string | null = null;

export async function savePushToken(token: string): Promise<void> {
  registeredPushToken = token;
}

export function currentPushToken(): string | null {
  return registeredPushToken;
}

// 서버 푸시(2차)용 Expo 푸시 토큰. EAS 프로젝트 ID가 없거나 권한이 없으면 null(기기 알림 사용).
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    const permission = await Notifications.getPermissionsAsync();
    const granted =
      permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return null;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "관리 전화",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

// usePush가 true면 서버가 보내므로 기기 자체 예약은 모두 지운다(중복 알림 방지).
export async function syncCallNotifications(
  schedule: ApiSchedule | null | undefined,
  { usePush = false }: { usePush?: boolean } = {},
): Promise<void> {
  if (Platform.OS === "web") return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.kind === KIND)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
  if (usePush || !schedule?.active || schedule.weekdays.length === 0) return;

  const permission = await Notifications.getPermissionsAsync();
  const granted =
    permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "관리 전화",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const [hour = 0, minute = 0] = schedule.time.split(":").map(Number);
  for (const day of schedule.weekdays) {
    const weekday = WEEKDAY_NUMBER[day];
    if (!weekday) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "베플리 선생님 전화가 왔어요",
        body: "오늘 복습할 표현으로 짧게 이야기해요. 눌러서 전화를 받아요.",
        data: { kind: KIND, type: "call" satisfies CallNotificationKind },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute, channelId: CHANNEL_ID },
    });
    if (schedule.reminderMinutesBefore > 0) {
      const at = shiftMinutes(weekday, hour, minute, -schedule.reminderMinutesBefore);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${schedule.reminderMinutesBefore}분 뒤 관리 전화가 와요`,
          body: "조용한 곳에서 베플리 선생님 전화를 기다려 주세요.",
          data: { kind: KIND, type: "reminder" satisfies CallNotificationKind },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, ...at, channelId: CHANNEL_ID },
      });
    }
  }
}

// 전화 알림을 누르거나(앱 밖) 앱을 쓰는 중에 전화 시각이 되면 수신 화면을 띄운다.
export function onIncomingCallNotification(handler: () => void): () => void {
  if (Platform.OS === "web") return () => {};
  const isCall = (data: Record<string, unknown> | undefined) => data?.kind === KIND && data?.type === "call";
  const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
    if (isCall(response.notification.request.content.data)) handler();
  });
  const received = Notifications.addNotificationReceivedListener((notification) => {
    if (isCall(notification.request.content.data)) handler();
  });
  return () => {
    tapped.remove();
    received.remove();
  };
}
