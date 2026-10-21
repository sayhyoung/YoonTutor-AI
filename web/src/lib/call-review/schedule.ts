// 전화관리 일정(교사가 설정, 학생은 읽기 전용). 시각은 모두 한국 시간(KST, UTC+9, 서머타임 없음) 기준.
// 나중에 LMS 일정관리 페이지로 옮길 수 있도록 형식·계산은 저장소와 분리해 둔다.

export const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const REMINDER_OPTIONS = [0, 5, 10, 20, 30] as const;

export type CallScheduleInput = {
  weekdays: Weekday[];
  time: string; // "HH:mm"
  reminderMinutesBefore: number;
  active: boolean;
};

export type StoredCallSchedule = CallScheduleInput & {
  schemaVersion: 1;
  customerNo: string;
  teacherNo: string;
  updatedAt: string;
  updatedByName: string | null;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
// Date#getUTCDay() 순서(일요일=0)
const DAY_BY_INDEX: Weekday[] = ["일", "월", "화", "수", "목", "금", "토"];

export function parseScheduleInput(
  value: unknown,
): { ok: true; input: CallScheduleInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "잘못된 요청이에요." };
  const body = value as Record<string, unknown>;

  if (!Array.isArray(body.weekdays)) return { ok: false, error: "전화 요일을 골라 주세요." };
  const picked = new Set(body.weekdays);
  const weekdays = WEEKDAYS.filter((day) => picked.has(day));
  if (weekdays.length !== picked.size) return { ok: false, error: "요일 값이 올바르지 않아요." };

  const time = typeof body.time === "string" ? body.time.trim() : "";
  if (!TIME.test(time)) return { ok: false, error: "전화 시간은 HH:mm 형식이어야 해요." };

  const reminder = Number(body.reminderMinutesBefore);
  if (!REMINDER_OPTIONS.includes(reminder as (typeof REMINDER_OPTIONS)[number])) {
    return { ok: false, error: "사전 알림 값이 올바르지 않아요." };
  }

  const active = body.active !== false;
  if (active && weekdays.length === 0) return { ok: false, error: "전화 요일을 한 개 이상 골라 주세요." };

  return { ok: true, input: { weekdays, time, reminderMinutesBefore: reminder, active } };
}

// KST 기준 날짜(그날 0시의 UTC 시각)에서 HH:mm을 더한 실제 시각.
function atKst(dayStartUtc: number, time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return dayStartUtc + (hour * 60 + minute) * 60 * 1000;
}

function kstDayStart(now: Date): number {
  const kst = now.getTime() + KST_OFFSET_MS;
  return Math.floor(kst / DAY_MS) * DAY_MS - KST_OFFSET_MS;
}

function weekdayOf(dayStartUtc: number): Weekday {
  return DAY_BY_INDEX[new Date(dayStartUtc + KST_OFFSET_MS).getUTCDay()];
}

// 지금 이후 가장 가까운 예정 통화 시각.
export function nextCallAt(schedule: CallScheduleInput, now = new Date()): Date | null {
  if (!schedule.active || schedule.weekdays.length === 0) return null;
  const today = kstDayStart(now);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = today + offset * DAY_MS;
    if (!schedule.weekdays.includes(weekdayOf(day))) continue;
    const at = atKst(day, schedule.time);
    if (at > now.getTime()) return new Date(at);
  }
  return null;
}

// 지금 이전(같은 시각 포함) 가장 최근 예정 통화 시각.
export function previousCallAt(schedule: CallScheduleInput, now = new Date()): Date | null {
  if (!schedule.active || schedule.weekdays.length === 0) return null;
  const today = kstDayStart(now);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = today - offset * DAY_MS;
    if (!schedule.weekdays.includes(weekdayOf(day))) continue;
    const at = atKst(day, schedule.time);
    if (at <= now.getTime()) return new Date(at);
  }
  return null;
}

export function formatKstTime(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const hour = kst.getUTCHours();
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}:${minute}`;
}

// 학생 앱 홈 카드용: "오늘 오후 7:30" / "내일 오후 7:30" / "10월 23일(목) 오후 7:30".
export function formatCallLabel(at: Date, now = new Date()): string {
  const days = Math.round((kstDayStart(at) - kstDayStart(now)) / DAY_MS);
  const time = formatKstTime(at);
  if (days === 0) return `오늘 ${time}`;
  if (days === 1) return `내일 ${time}`;
  const kst = new Date(at.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일(${weekdayOf(kstDayStart(at))}) ${time}`;
}

// API 응답용: 교사·학생 공통 일정 화면 데이터(회원·교사 번호 제외).
export type ScheduleView = {
  weekdays: Weekday[];
  time: string;
  reminderMinutesBefore: number;
  active: boolean;
  callsPerWeek: number;
  updatedAt: string;
  updatedByName: string | null;
  nextCallAt: string | null;
  nextCallLabel: string | null;
};

export function toScheduleView(stored: StoredCallSchedule, now = new Date()): ScheduleView {
  const next = nextCallAt(stored, now);
  return {
    weekdays: stored.weekdays,
    time: stored.time,
    reminderMinutesBefore: stored.reminderMinutesBefore,
    active: stored.active,
    callsPerWeek: stored.active ? stored.weekdays.length : 0,
    updatedAt: stored.updatedAt,
    updatedByName: stored.updatedByName,
    nextCallAt: next?.toISOString() ?? null,
    nextCallLabel: next ? formatCallLabel(next, now) : null,
  };
}
