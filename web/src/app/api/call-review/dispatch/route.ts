import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { claimDispatch, devicesWithSchedules, removeTokens } from "@/lib/call-review/device-store";
import { buildMessages, dueEvents, sendExpoPush } from "@/lib/call-review/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 예약 작업(Cloud Scheduler 등)이 5분마다 호출한다. 간격보다 조금 넓게 보고 중복은 기록으로 막는다.
const DEFAULT_WINDOW_MINUTES = 7;

function authorized(request: Request): boolean {
  const secret = process.env.CALL_REVIEW_CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isServerStoreConfigured()) return NextResponse.json({ error: "store not configured" }, { status: 503 });

  const minutes = Math.min(Math.max(Number(new URL(request.url).searchParams.get("window")) || DEFAULT_WINDOW_MINUTES, 1), 30);
  const now = new Date();
  const from = new Date(now.getTime() - minutes * 60 * 1000);

  const targets = await devicesWithSchedules();
  let events = 0;
  let sent = 0;
  const invalid: string[] = [];
  for (const { schedule, tokens } of targets) {
    for (const event of dueEvents(schedule, from, now)) {
      if (!(await claimDispatch(schedule.customerNo, event.kind, event.at))) continue;
      events += 1;
      const result = await sendExpoPush(buildMessages(tokens, event, schedule.reminderMinutesBefore));
      sent += result.sent;
      invalid.push(...result.invalidTokens);
    }
  }
  await removeTokens(invalid);

  // 회원 식별정보 없이 집계만 돌려준다.
  return NextResponse.json({ checkedStudents: targets.length, events, sent, removedTokens: invalid.length });
}
